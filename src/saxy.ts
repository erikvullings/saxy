import { Transform } from 'readable-stream';
import { StringDecoder } from 'string_decoder';
import { findIndexOutside } from './util';
import { parseAttrs, parseEntities } from './static';

export type TextNode = {
  /** The text value */
  contents: string;
};

export type CDATANode = {
  /** The CDATA contents */
  contents: string;
};

export type CommentNode = {
  /** The comment contents */
  contents: string;
};

export type ProcessingInstructionNode = {
  /** The instruction contents */
  contents: string;
};

/** Information about an opened tag */
export type TagOpenNode = {
  /** Name of the tag that was opened. */
  name: string;
  /**
   * Attributes passed to the tag, in a string representation
   * (use Saxy.parseAttributes to get an attribute-value mapping).
   */
  attrs: string;
  /**
   * Whether the tag self-closes (tags of the form `<tag />`).
   * Such tags will not be followed by a closing tag.
   */
  isSelfClosing: boolean;
};

/** Information about a closed tag */
export type TagCloseNode = {
  /** Name of the tag that was closed. */
  name: string;
};

export type NextFunction = (err?: Error) => void;

export interface SaxyEvents {
  finish: () => void;
  error: (err: Error) => void;
  text: (data: TextNode) => void;
  cdata: (data: CDATANode) => void;
  comment: (data: CommentNode) => void;
  processinginstruction: (data: ProcessingInstructionNode) => void;
  tagopen: (data: TagOpenNode) => void;
  tagclose: (data: TagCloseNode) => void;
}

export type SaxyEventNames = keyof SaxyEvents;

export type SaxyEventArgs =
  | Error
  | TextNode
  | CDATANode
  | CommentNode
  | ProcessingInstructionNode
  | TagOpenNode
  | TagCloseNode;

export interface Saxy {
  on<U extends SaxyEventNames>(event: U, listener: SaxyEvents[U]): this;

  once<U extends SaxyEventNames>(event: U, listener: SaxyEvents[U]): this;
}

/**
 * Nodes that can be found inside an XML stream.
 */
const Node = {
  text: 'text',
  cdata: 'cdata',
  comment: 'comment',
  processingInstruction: 'processinginstruction',
  tagOpen: 'tagopen',
  tagClose: 'tagclose',
  // markupDeclaration: 'markupDeclaration',
} as Record<string, SaxyEventNames>;

/**
 * Parse an XML stream and emit events corresponding
 * to the different tokens encountered.
 */
export class Saxy extends Transform {
  private _decoder: StringDecoder;
  private _tagStack: string[];
  private _waiting: { token: string; data: unknown } | null;

  /**
   * Parse a string of XML attributes to a map of attribute names
   * to their values
   *
   * @param input A string of XML attributes
   * @throws { Error } If the string is malformed
   * @return { Record<string, unknown> } A map of attribute names to their values
   */
  static parseAttrs = parseAttrs;

  /**
   * Expand a piece of XML text by replacing all XML entities
   * by their canonical value. Ignore invalid and unknown
   * entities
   *
   * @param { string } input A string of XML text
   * @return { string } The input string, expanded
   */
  static parseEntities = parseEntities;

  /**
   * Create a new parser instance.
   */
  constructor() {
    super({ decodeStrings: false });

    // String decoder instance
    const state = this._writableState;
    this._decoder = new StringDecoder(state.defaultEncoding);

    // Stack of tags that were opened up until the current cursor position
    this._tagStack = [];

    // Not waiting initially
    this._waiting = null;
  }

  /**
   * Handle a chunk of data written into the stream.
   *
   * @param {Buffer|string} chunk Chunk of data.
   * @param {string} encoding Encoding of the string, or 'buffer'.
   * @param {function} callback Called when the chunk has been parsed, with
   * an optional error argument.
   */
  public _write(chunk: Buffer | string, encoding: string, callback: NextFunction) {
    const data = encoding === 'buffer' ? this._decoder.write(chunk as Buffer) : (chunk as string);

    this._parseChunk(data, callback);
  }

  /**
   * Handle the end of incoming data.
   *
   * @param {function} callback
   */
  public _final(callback: NextFunction) {
    // Make sure all data has been extracted from the decoder
    this._parseChunk(this._decoder.end(), (err?: Error) => {
      if (err) {
        callback(err);
        return;
      }

      // Handle unclosed nodes
      if (this._waiting !== null) {
        switch (this._waiting.token) {
          case Node.text:
            // Text nodes are implicitly closed
            this.emit('text', { contents: this._waiting.data });
            break;
          case Node.cdata:
            callback(new Error('Unclosed CDATA section'));
            return;
          case Node.comment:
            callback(new Error('Unclosed comment'));
            return;
          case Node.processingInstruction:
            callback(new Error('Unclosed processing instruction'));
            return;
          case Node.tagOpen:
          case Node.tagClose:
            // We do not distinguish between unclosed opening
            // or unclosed closing tags
            callback(new Error('Unclosed tag'));
            return;
          default:
          // Pass
        }
      }

      if (this._tagStack.length !== 0) {
        callback(new Error(`Unclosed tags: ${this._tagStack.join(',')}`));
        return;
      }

      callback();
    });
  }

  /**
   * Immediately parse a complete chunk of XML and close the stream.
   *
   * @param input Input chunk.
   */
  public parse(input: Buffer | string): this {
    this.end(input);
    return this;
  }

  /**
   * Put the stream into waiting mode, which means we need more data
   * to finish parsing the current token.
   *
   * @param token Type of token that is being parsed.
   * @param data Pending data.
   */
  private _wait(token: string, data: unknown) {
    this._waiting = { token, data };
  }

  /**
   * Put the stream out of waiting mode.
   *
   * @return Any data that was pending.
   */
  private _unwait() {
    if (this._waiting === null) {
      return '';
    }

    const data = this._waiting.data;
    this._waiting = null;
    return data;
  }

  /**
   * Handle the opening of a tag in the text stream.
   *
   * Push the tag into the opened tag stack and emit the
   * corresponding event on the event emitter.
   *
   * @param {TagOpen} node Information about the opened tag.
   */
  private _handleTagOpening(node: TagOpenNode) {
    if (!node.isSelfClosing) {
      this._tagStack.push(node.name);
    }

    this.emit(Node.tagOpen, node);
  }

  /**
   * Parse a XML chunk.
   *
   * @private
   * @param {string} input A string with the chunk data.
   * @param {function} callback Called when the chunk has been parsed, with
   * an optional error argument.
   */
  private _parseChunk(input: string, callback: NextFunction) {
    // Use pending data if applicable and get out of waiting mode
    input = this._unwait() + input;

    let chunkPos = 0;
    const end = input.length;

    while (chunkPos < end) {
      if (input[chunkPos] !== '<') {
        const nextTag = input.indexOf('<', chunkPos);

        // We read a TEXT node but there might be some
        // more text data left, so we wait
        if (nextTag === -1) {
          this._wait(Node.text, input.slice(chunkPos));
          break;
        }

        // A tag follows, so we can be confident that
        // we have all the data needed for the TEXT node
        this.emit(Node.text, { contents: input.slice(chunkPos, nextTag) });

        chunkPos = nextTag;
      }

      // Invariant: the cursor now points on the name of a tag,
      // after an opening angled bracket
      chunkPos += 1;
      const nextChar = input[chunkPos];

      // Begin a DOCTYPE, CDATA or comment section
      if (nextChar === '!') {
        chunkPos += 1;
        const nextNextChar = input[chunkPos];

        // Unclosed markup declaration section of unknown type,
        // we need to wait for upcoming data
        if (nextNextChar === undefined) {
          this._wait(Node.markupDeclaration, input.slice(chunkPos - 2));
          break;
        }

        if (
          nextNextChar === '[' &&
          'CDATA['.indexOf(input.slice(chunkPos + 1, chunkPos + 7)) > -1
        ) {
          chunkPos += 7;
          const cdataClose = input.indexOf(']]>', chunkPos);

          // Incomplete CDATA section, we need to wait for upcoming data
          if (cdataClose === -1) {
            this._wait(Node.cdata, input.slice(chunkPos - 9));
            break;
          }

          this.emit(Node.cdata, {
            contents: input.slice(chunkPos, cdataClose),
          });

          chunkPos = cdataClose + 3;
          continue;
        }

        if (
          nextNextChar === '-' &&
          (input[chunkPos + 1] === undefined || input[chunkPos + 1] === '-')
        ) {
          chunkPos += 2;
          const commentClose = input.indexOf('--', chunkPos);

          // Incomplete comment node, we need to wait for
          // upcoming data
          if (commentClose === -1 || input[commentClose + 2] === undefined) {
            this._wait(Node.comment, input.slice(chunkPos - 4));
            break;
          }

          if (input[commentClose + 2] !== '>') {
            callback(
              new Error(`Unexpected -- inside comment: \
'${input.slice(chunkPos - 4)}'`)
            );
            return;
          }

          this.emit(Node.comment, {
            contents: input.slice(chunkPos, commentClose),
          });

          chunkPos = commentClose + 3;
          continue;
        }

        // TODO: recognize DOCTYPEs here
        callback(new Error('Unrecognized sequence: <!' + nextNextChar));
        return;
      }

      if (nextChar === '?') {
        chunkPos += 1;
        const piClose = input.indexOf('?>', chunkPos);

        // Unclosed processing instruction, we need to wait for upcoming data
        if (piClose === -1) {
          this._wait(Node.processingInstruction, input.slice(chunkPos - 2));
          break;
        }

        this.emit(Node.processingInstruction, {
          contents: input.slice(chunkPos, piClose),
        });

        chunkPos = piClose + 2;
        continue;
      }

      // Recognize regular tags (< ... >)
      const tagClose = findIndexOutside(input, (char: string) => char === '>', '"', chunkPos);

      if (tagClose === -1) {
        this._wait(Node.tagOpen, input.slice(chunkPos - 1));
        break;
      }

      // Check if the tag is a closing tag
      if (input[chunkPos] === '/') {
        const tagName = input.slice(chunkPos + 1, tagClose);
        const stackedTagName = this._tagStack.pop();

        if (stackedTagName !== tagName) {
          callback(new Error(`Unclosed tag: ${stackedTagName}`));
          this._tagStack.length = 0;
          return;
        }

        this.emit(Node.tagClose, { name: tagName });

        chunkPos = tagClose + 1;
        continue;
      }

      // Check if the tag is self-closing
      const isSelfClosing = input[tagClose - 1] === '/';
      let realTagClose = isSelfClosing ? tagClose - 1 : tagClose;

      // Extract the tag name and attributes
      const whitespace = input.slice(chunkPos).search(/\s/);

      if (whitespace === -1 || whitespace >= tagClose - chunkPos) {
        // Tag without any attribute
        this._handleTagOpening({
          name: input.slice(chunkPos, realTagClose),
          attrs: '',
          isSelfClosing,
        });
      } else if (whitespace === 0) {
        callback(new Error('Tag names may not start with whitespace'));
        return;
      } else {
        // Tag with attributes
        this._handleTagOpening({
          name: input.slice(chunkPos, chunkPos + whitespace),
          attrs: input.slice(chunkPos + whitespace, realTagClose),
          isSelfClosing,
        });
      }

      chunkPos = tagClose + 1;
    }

    callback();
  }
}
