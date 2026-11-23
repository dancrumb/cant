import { CantError, type NativeAction } from '@dancrumb/cant-native';
import { numberToText as decimalText } from '@dancrumb/cant-shared';

/**
 * cant::Conversion (docs/adr/0045-conversion.md), declared by
 * packages/compiler/stdlib/Conversion.cant. A number is written as an optional `-`, digits, and
 * optionally `.` and more digits, with `0` to `9` and then `a` to `z`, in either case, as digits.
 */

/** The base, checked: a whole number from 2 to 36, which is as far as the digits go. */
function baseOf(base: unknown): number {
  if (typeof base !== 'number' || !Number.isInteger(base) || base < 2 || base > 36) {
    throw new CantError('InvalidBase');
  }
  return base;
}

/** The digits of a base, in order, so that a digit's value is its index. */
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * `numerator / denominator`, for a positive denominator, as the nearest NUMBER, with a tie going
 * to the one whose last bit is 0, as IEEE 754 rounds. It is `Infinity` when it is too large for a
 * NUMBER. Rounding once, from the exact quotient, is what makes a number written in any base read
 * back as itself.
 */
function nearest(numerator: bigint, denominator: bigint): number {
  if (numerator === 0n) {
    return 0;
  }
  const bits = (value: bigint): number => value.toString(2).length;
  // The power of two at or below the quotient: 2 ** exponent <= numerator / denominator.
  let exponent = bits(numerator) - bits(denominator);
  const below = exponent >= 0 ? numerator < denominator << BigInt(exponent) : numerator << BigInt(-exponent) < denominator;
  if (below) {
    exponent -= 1;
  }
  if (exponent > 1023) {
    return Infinity;
  }
  // The value of the quotient's last bit: 53 bits from its first, or the smallest a NUMBER has.
  const unit = Math.max(exponent - 52, -1074);
  const scaledNumerator = unit < 0 ? numerator << BigInt(-unit) : numerator;
  const scaledDenominator = unit > 0 ? denominator << BigInt(unit) : denominator;
  let quotient = scaledNumerator / scaledDenominator;
  const twiceRemainder = (scaledNumerator % scaledDenominator) * 2n;
  if (twiceRemainder > scaledDenominator || (twiceRemainder === scaledDenominator && quotient % 2n === 1n)) {
    quotient += 1n;
  }
  // The quotient has at most 54 bits, so it and its product with a power of two are exact.
  return Number(quotient) * 2 ** unit;
}

/**
 * The NUMBER that `text` writes in `base`. Nothing else may be in the text: no spaces, `+`,
 * prefix such as `0x`, or exponent. A number too large for a NUMBER isn't one.
 */
export const textToNumber: NativeAction = ({ text, base }) => {
  const radix = baseOf(base);
  // The digits are letters and numbers, so they can go in a character class as they are. Without
  // the `u` flag, `i` matches only ASCII letters' other case, so a character such as the Kelvin
  // sign, which lower-cases to `k`, isn't a digit.
  const digit = `[${DIGITS.slice(0, radix)}]`;
  const match = new RegExp(`^(-?)(${digit}+)(?:\\.(${digit}+))?$`, 'i').exec(text as string);
  if (match === null) {
    throw new CantError('NotANumber');
  }
  // Every digit is ASCII now, so lower-casing them can't change how many there are.
  // An unmatched group, such as the fraction of a whole number, is `undefined`.
  const [, sign = '', whole = '', fraction = ''] = match.map((part: string | undefined) => part?.toLowerCase());
  // The digits, all as one whole number, over the base to the power of the fraction's length.
  const radix_ = BigInt(radix);
  let numerator = 0n;
  for (const character of whole + fraction) {
    numerator = numerator * radix_ + BigInt(DIGITS.indexOf(character));
  }
  const value = nearest(numerator, radix_ ** BigInt(fraction.length));
  if (!Number.isFinite(value)) {
    throw new CantError('NotANumber');
  }
  // `+ 0`, so that `-0` is `0`.
  return (sign === '-' ? -value : value) + 0;
};

/**
 * `number` written in `base`. In base 10, it is written as Cant converts a NUMBER to text
 * (docs/adr/0011-converting-values-to-text.md). In any other base, it is written with the fewest
 * digits after the point that read back as the same NUMBER, and never with an exponent.
 */
export const numberToText: NativeAction = ({ number, base }) => {
  const radix = baseOf(base);
  const value = number as number;
  return radix === 10 ? decimalText(value) : inBase(value, radix);
};

/**
 * `value` in a base other than 10. Its exact value is a whole number over a power of two, which is
 * rounded to the nearest number with 0 digits after the point, then 1, and so on, until one reads
 * back as `value`, which happens by the time every digit of the exact value is written.
 */
function inBase(value: number, radix: number): string {
  const sign = value < 0 ? '-' : '';
  // Doubling a NUMBER that isn't whole is exact, since it is below 2 ** 52.
  let mantissa = Math.abs(value);
  let shift = 0;
  while (!Number.isInteger(mantissa)) {
    mantissa *= 2;
    shift += 1;
  }
  const radix_ = BigInt(radix);
  const numerator = BigInt(mantissa);
  const denominator = 2n ** BigInt(shift);
  for (let places = 0; ; places++) {
    const scale = radix_ ** BigInt(places);
    const scaled = numerator * scale;
    let digits = scaled / denominator;
    if ((scaled % denominator) * 2n >= denominator) {
      digits += 1n;
    }
    if (nearest(digits, scale) === Math.abs(value)) {
      const written = digits.toString(radix).padStart(places + 1, '0');
      const whole = written.slice(0, written.length - places);
      // `- 0` is `0`, so a number that rounds to 0 has no sign.
      return `${digits === 0n ? '' : sign}${places === 0 ? whole : `${whole}.${written.slice(-places)}`}`;
    }
  }
}
