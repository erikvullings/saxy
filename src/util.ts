/**
 * Check if a character is a whitespace character according
 * to the XML spec (space, carriage return, line feed or tab)
 *
 * @param character Character to check
 * @return Whether the character is whitespace or not
 */
export const isWhitespace = (character: string) => /\s/.test(character);

/**
 * Find the first character in a string that matches a predicate
 * while being outside the given delimiters.
 *
 * @param haystack String to search in
 * @param predicate Checks whether a character is permissible
 * @param [delim=''] Delimiter inside which no match should be
 * returned. If empty, all characters are considered.
 * @param [fromIndex=0] Start the search from this index
 * @return Index of the first match, or -1 if no match
 */
export const findIndexOutside = (
  haystack: string,
  predicate: Function,
  delim = '',
  fromIndex = 0
) => {
  const length = haystack.length;
  let index = fromIndex;
  let inDelim = false;

  while (index < length && (inDelim || !predicate(haystack[index]))) {
    if (haystack[index] === delim) {
      inDelim = !inDelim;
    }

    ++index;
  }

  return index === length ? -1 : index;
};
