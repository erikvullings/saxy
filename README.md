# Saxy

Fast and lightweight event-driven streaming XML parser in pure TypeScript.

[![npm version](https://img.shields.io/npm/v/saxy.svg?style=flat-square)](https://www.npmjs.com/package/saxy)
[![npm downloads](https://img.shields.io/npm/dm/saxy.svg?style=flat-square)](https://www.npmjs.com/package/saxy)
[![build status](https://img.shields.io/travis/erikvullings/saxy.svg?style=flat-square)](https://travis-ci.com/erikvullings/saxy)
[![coverage](https://img.shields.io/coveralls/erikvullings/saxy.svg?style=flat-square)](https://coveralls.io/github/erikvullings/saxy)

Saxy is forked from [Saxophone](https://github.com/matteodelabre/saxophone) version 0.7.2 and converted to TypeScript, so most credits go to Mattéo Delabre. Besides converting it to TypeScript, so you have proper typings when using it, it also includes several unmerged pull requests, i.e. testing on Node 16, and the parser is a `Transform` stream instead of a `Writeable` stream.

It is inspired by SAX parsers such as [sax-js](https://github.com/isaacs/sax-js) and [EasySax](https://github.com/vflash/easysax): unlike most XML parsers, it does not create a Document Object Model ([DOM](https://en.wikipedia.org/wiki/Document_Object_Model)) tree as a result of parsing documents. Instead, it emits events for each tag or text node encountered as the parsing goes on. This means that Saxy has a really low memory footprint and can easily parse large documents.

The parser does not keep track of the document state while parsing and, in particular, does not check whether the document is well-formed or valid, making it super-fast (see [benchmarks](#benchmarks) below).

This library is best suited when you need to extract simple data out of an XML document that you know is well-formed. The parser will not report precise errors in case of syntax problems. An example would be reading data from an API endpoint.

## Installation

This library works both in Node.JS ≥6.0 and recent browsers.
To install, use either one of below commands:

```sh
npm install --save saxy
pnpm add saxy
yarn add saxy
```

## Benchmark

This benchmark compares the performance of four of the most popular SAX parsers against Saxy’s performance while parsing a 21 KB document. Below are the results when run on a Intel® Core™ i7-7500U processor (2.70GHz, 2 physical cores with 2 logical cores each).

| Library            | Version | Operations per second (higher is better) |
| ------------------ | ------: | ---------------------------------------: |
| **Saxy**           |   0.5.0 |                         **6,840 ±1.48%** |
| **EasySax**        |   0.3.2 |                         **7,354 ±1.16%** |
| node-expat         |  2.3.17 |                             1,251 ±0.60% |
| libxmljs.SaxParser |  0.19.5 |                             1,007 ±0.81% |
| sax-js             |   1.2.4 |                               982 ±1.50% |

To run the benchmark by yourself, use the following commands:

```sh
git clone https://github.com/matteodelabre/saxy.git
cd saxy
npm install
npm install --no-save easysax node-expat libxmljs sax
npm run benchmark
```

## Tests and coverage

To run tests and check coverage, use the following commands:

```sh
git clone https://github.com/matteodelabre/saxy.git
cd saxy
npm install
npm test
npm run coverage
```

## Examples

### Simple example

```js
import { Saxy } from 'Saxy';
const parser = new Saxy();

// Called whenever an opening tag is found in the document,
// such as <example id="1" /> - see below for a list of events
parser.on('tagopen', tag => {
  console.log(
    `Open tag "${tag.name}" with attributes: ${JSON.stringify(Saxy.parseAttrs(tag.attrs))}.`
  );
});

// Called when we are done parsing the document
parser.on('finish', () => {
  console.log('Parsing finished.');
});

// Triggers parsing - remember to set up listeners before
// calling this method
parser.parse('<root><example id="1" /><example id="2" /></root>');
```

Output:

```sh
Open tag "root" with attributes: {}.
Open tag "example" with attributes: {"id":"1"}.
Open tag "example" with attributes: {"id":"2"}.
Parsing finished.
```

### Streaming example

Same example as above but with `Stream`s.

```ts
import { Saxy } from 'saxy';
const parser = new Saxy();

// Called whenever an opening tag is found in the document,
// such as <example id="1" /> - see below for a list of events
parser.on('tagopen', tag => {
  console.log(
    `Open tag "${tag.name}" with attributes: ${JSON.stringify(Saxy.parseAttrs(tag.attrs))}.`
  );
});

// Called when we are done parsing the document
parser.on('finish', () => {
  console.log('Parsing finished.');
});

// stdin is '<root><example id="1" /><example id="2" /></root>'
process.stdin.setEncoding('utf8');
process.stdin.pipe(parser);
```

Output:

```sh
Open tag "root" with attributes: {}.
Open tag "example" with attributes: {"id":"1"}.
Open tag "example" with attributes: {"id":"2"}.
Parsing finished.
```

### Transform Stream (marcellino-ornelas)

Saxy can now be used as a transform stream to send the parsed XML to another stream. Saxy works to keep low memory so it doesn't save any of the XML internally but uses events to fire certain data. So how do you tell the parser to send data to the next stream? The way to send data to another stream is to use the `parser.push()` method.

Example:

```xml
<root>
  <page>Hey this is some text</page>
</root>
```

```ts
import { createReadStream } from 'fs';
import { Saxy } from 'saxy';

const parser = new Saxy();

parser.on('text', function(data) {
  // Get the text from saxy
  const text = data.contents;

  // Send the data to the next stream;
  parser.push(text);
});

createReadStream('file.xml')
  .pipe(parser)
  .pipe(process.stdout); // Hey this is some text
```

## Documentation

### `new Saxy()`

Creates a new Saxy parser instance. This object is a writable stream that will emit an event for each tag or node parsed from the incoming data. See [the list of events below.](#events)

### `Saxy#on()`, `Saxy#removeListener()`

Manage event listeners just like with any other event emitter. Saxy inherits from all `EventEmitter` methods. See the relevant [Node documentation.](https://nodejs.org/api/events.html)

### `Saxy#parse(xml)`

Trigger the parsing of a whole document. This method will fire registered listeners, so you need to set them up before calling it. This is equivalent to writing `xml` to the stream and closing it.

**Note:** the parser cannot be reused afterwards, you need to create a new instance.

Arguments:

- `xml` is an UTF-8 string or a `Buffer` containing the XML that you want to parse.

This method returns the parser instance.

### `Saxy#write(xml)`

Parse a chunk of a XML document. This method will fire registered listeners so you need to set them up before calling it.

**Note:** an event is emitted for a tag or a node only when it has been closed. If the chunk starts a tag but does not close it, the tag will not be reported until it is closed by a later chunk.

Arguments:

- `xml` is an UTF-8 string or a `Buffer` containing a chunk of the XML that you want to parse.

### `Saxy#end(xml = "")`

Write an optional last chunk then close the stream. After the stream is closed, a final `finish` event is emitted and no other event will be emitted afterwards. No more data may be written into the stream after closing it.

Arguments:

- `xml` is an UTF-8 string or a `Buffer` containing a chunk of the XML that you want to parse.

### `Saxy.parseAttrs(attrs)`

Parse a string list of XML attributes, as produced by the main parsing algorithm. This is not done automatically because it may not be required for every tag and it takes some time.

The result is an object associating the attribute names (as object keys) to their attribute values (as object values).

### `Saxy.parseEntities(text)`

Parses a piece of XML text and expands all XML entities inside it to the character they represent. Just like attributes, this is not parsed automatically because it takes some time.

This ignores invalid entities, including unrecognized ones, leaving them as-is.

### Events

#### `tagopen`

Emitted when an opening tag is parsed. This encompasses both regular tags and self-closing tags. An object is passed with the following data:

- `name`: name of the parsed tag.
- `attrs`: attributes of the tag (as a string). To parse this string, use `Saxy.parseAttrs`.
- `isSelfClosing`: true if the tag is self-closing.

#### `tagclose`

Emitted when a closing tag is parsed. An object containing the `name` of the tag is passed.

#### `processinginstruction`

Emitted when a processing instruction (such as `<? contents ?>`) is parsed. An object with the `contents` of the processing instruction is passed.

#### `text`

Emitted when a text node between two tags is parsed. An object with the `contents` of the text node is passed. You might need to expand XML entities inside the contents of the text node, using `Saxy.parseEntities`.

#### `cdata`

Emitted when a CDATA section (such as `<![CDATA[ contents ]]>`) is parsed. An object with the `contents` of the CDATA section is passed.

#### `comment`

Emitted when a comment (such as `<!-- contents -->`) is parsed. An object with the `contents` of the comment is passed.

#### `error`

Emitted when a parsing error is encountered while reading the XML stream such that the rest of the XML cannot be correctly interpreted:

- when a DOCTYPE node is found (not supported yet);
- when a comment node contains the `--` sequence;
- when opening and closing tags are mismatched or missing;
- when a tag name starts with white space;
- when nodes are unclosed (missing their final `>`).

Because this library's goal is not to provide accurate error reports, the passed error will only contain a short description of the syntax error (without giving the position, for example).

#### `finish`

Emitted after all events, without arguments.

## Contributions

This is free and open source software. All contributions (even small ones) are welcome. [Check out the contribution guide to get started!](CONTRIBUTING.md)

Thanks to [Norman Rzepka](https://github.com/normanrz) for implementing the streaming API and the check for opening and closing tags mismatch.

## License

Released under the MIT license. [See the full license text.](LICENSE)
