import type { NativeAction } from '@dancrumb/cant-native';

/**
 * cant::Text (docs/adr/0046-text.md), declared by packages/compiler/stdlib/Text.cant. A character
 * is a Unicode code point, so text is worked on as an array of code points, which iterating a
 * JavaScript string gives. Indexes work as an array's do (docs/adr/0021-collections.md).
 */

/** The characters of a text: its code points, each as a string. */
const charactersOf = (text: unknown): string[] => Array.from(text as string);

/**
 * An index as an array uses it: truncated towards zero, and counted from the end when it is
 * negative. It may still be past either end.
 */
const position = (index: number, length: number): number => {
  const whole = Math.trunc(index);
  return whole < 0 ? length + whole : whole;
};

/** The number of characters in `text`. */
export const length: NativeAction = ({ text }) => charactersOf(text).length;

/**
 * The pieces of `text` between each `delim`, in order, including empty pieces where two are next
 * to each other or at an end. With `""` as `delim`, each character is a piece, so `""` has none.
 */
export const split: NativeAction = ({ text, delim }) => (delim === '' ? charactersOf(text) : (text as string).split(delim as string));

/** White space, as Unicode defines it, and line breaks, as JavaScript's `trim` removes them. */
export const trimLeft: NativeAction = ({ text }) => (text as string).trimStart();

export const trimRight: NativeAction = ({ text }) => (text as string).trimEnd();

export const trim: NativeAction = ({ text }) => (text as string).trim();

/**
 * The characters from `start` up to, but not including, `end`, or the end of the text. A position
 * past either end is taken as that end, and an `end` at or before `start` gives `""`.
 */
export const slice: NativeAction = ({ text, start, end }) => {
  const characters = charactersOf(text);
  const clamp = (index: number): number => Math.min(Math.max(position(index, characters.length), 0), characters.length);
  return characters.slice(clamp(start as number), end === undefined ? characters.length : clamp(end as number)).join('');
};

/** The character at `index`, or `undefined`, for `NOTHING`, when the index is past either end. */
export const charAt: NativeAction = ({ text, index }) => {
  const characters = charactersOf(text);
  return characters[position(index as number, characters.length)];
};

/** `text` written `times` times, truncated towards zero, or `""` when that is 0 or less. */
export const repeat: NativeAction = ({ text, times }) => (text as string).repeat(Math.max(Math.trunc(times as number), 0));
