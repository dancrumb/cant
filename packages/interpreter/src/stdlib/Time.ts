import { CantError, type NativeAction } from '@dancrumb/cant-native';
import { DATE_TIME_LIMIT, dateTimeMilliseconds, isDateTimeText } from '@dancrumb/cant-shared';
import { TZDate } from '@date-fns/tz';
import { addDays as addCalendarDays, addMonths as addCalendarMonths, addYears as addCalendarYears } from 'date-fns';

/**
 * cant::Time (docs/adr/0026-dates-and-times.md), declared by packages/compiler/stdlib/Time.cant.
 * Calendar moves happen in the given IANA time zone, with date-fns: adding days keeps the local
 * time of day, a local time the clocks skip is moved later by the length of the gap, a local
 * time that happens twice takes the later of the two, and adding months or years keeps the day
 * of the month where it can, and otherwise uses the month's last day.
 */

const unknownTimeZone = (): CantError => new CantError('UnknownTimeZone');

/** Whether the runtime knows an IANA time zone. */
function knowsZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Move `time` by a whole number of calendar units in `zone`, with one of date-fns's adders. */
const calendarMove =
  (unit: 'days' | 'months' | 'years', add: (date: TZDate, amount: number) => TZDate): NativeAction =>
  (args) => {
    const time = args.time as Date;
    const amount = args[unit] as number;
    const zone = args.zone as string;
    if (!knowsZone(zone)) {
throw unknownTimeZone();
}
    if (!Number.isInteger(amount)) {
throw new CantError('NotWholeNumber');
}
    return new Date(add(new TZDate(time.getTime(), zone), amount).getTime());
  };

/** `time` moved by whole calendar days in `zone`, keeping its local time of day. */
export const addDays = calendarMove('days', addCalendarDays);

/** `time` moved by whole calendar months in `zone`, keeping the day of the month where it can. */
export const addMonths = calendarMove('months', addCalendarMonths);

/** `time` moved by whole calendar years in `zone`, keeping the day of the month where it can. */
export const addYears = calendarMove('years', addCalendarYears);

/** The lengths `Intl.DateTimeFormat` writes each style with. */
const STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: 'medium' },
  time: { timeStyle: 'medium' },
  dateTime: { dateStyle: 'medium', timeStyle: 'medium' },
};

/**
 * `time` written for people, in `zone`, following the locale's conventions, as
 * `Intl.DateTimeFormat` writes it at its medium length. A locale the runtime can't use falls
 * back to `en`.
 */
export const format: NativeAction = ({ time, zone, locale, style }) => {
  if (!knowsZone(zone as string)) {
throw unknownTimeZone();
}
  let locales = 'en';
  try {
    locales = Intl.getCanonicalLocales(locale as string)[0] ?? 'en';
  } catch {
    // A locale that isn't well formed falls back to `en`.
  }
  return new Intl.DateTimeFormat(locales, { timeZone: zone as string, ...STYLES[style as string] }).format(time as Date);
};

/** The instant that `text` names, written as a `DATE_TIME` literal's string is. */
export const parse: NativeAction = ({ text }) => {
  const written = text as string;
  const milliseconds = isDateTimeText(written) ? dateTimeMilliseconds(written) : Number.NaN;
  if (Number.isNaN(milliseconds) || Math.abs(milliseconds) > DATE_TIME_LIMIT) {
throw new CantError('InvalidDateTime');
}
  return new Date(milliseconds);
};
