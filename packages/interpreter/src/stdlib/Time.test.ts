import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { CantError } from '@dancrumb/cant-native';
import { STANDARD_ACTIONS } from './index.ts';

const call = (name: string, args: Record<string, unknown>): unknown => {
  const action = STANDARD_ACTIONS.get(`cant::Time#${name}`);
  assert.ok(action, `cant::Time#${name} is implemented`);
  return action(args, { signal: new AbortController().signal, streams: { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() } });
};
const at = (iso: string): Date => new Date(iso);
const iso = (value: unknown): string => (value as Date).toISOString();
const raises = (name: string, args: Record<string, unknown>, error: string): void => {
  assert.throws(() => call(name, args), (caught: unknown) => CantError.is(caught) && caught.error === error);
};

test('adding days keeps the local time of day across a daylight saving change', () => {
  // 09:30 GMT on 28 March 2026, then 09:30 BST the next day, which is 23 hours later.
  assert.equal(iso(call('addDays', { time: at('2026-03-28T09:30:00Z'), days: 1, zone: 'Europe/London' })), '2026-03-29T08:30:00.000Z');
  assert.equal(iso(call('addDays', { time: at('2026-03-29T08:30:00Z'), days: -1, zone: 'Europe/London' })), '2026-03-28T09:30:00.000Z');
});

test('a local time the clocks skip moves later by the gap, and one that happens twice takes the later', () => {
  // 01:30 doesn't happen in London on 29 March 2026: it becomes 02:30 BST.
  assert.equal(iso(call('addDays', { time: at('2026-03-28T01:30:00Z'), days: 1, zone: 'Europe/London' })), '2026-03-29T01:30:00.000Z');
  // 01:30 happens twice on 25 October 2026: the later is 01:30 GMT.
  assert.equal(iso(call('addDays', { time: at('2026-10-26T01:30:00Z'), days: -1, zone: 'Europe/London' })), '2026-10-25T01:30:00.000Z');
});

test("adding months or years keeps the day of the month where it can, and otherwise uses the month's last day", () => {
  assert.equal(iso(call('addMonths', { time: at('2027-01-31T12:00:00Z'), months: 1, zone: 'UTC' })), '2027-02-28T12:00:00.000Z');
  assert.equal(iso(call('addYears', { time: at('2028-02-29T12:00:00Z'), years: 1, zone: 'UTC' })), '2029-02-28T12:00:00.000Z');
});

test('raises UnknownTimeZone and NotWholeNumber', () => {
  raises('addDays', { time: at('2026-01-01T00:00:00Z'), days: 1, zone: 'Mars/Olympus' }, 'UnknownTimeZone');
  raises('addMonths', { time: at('2026-01-01T00:00:00Z'), months: 1.5, zone: 'UTC' }, 'NotWholeNumber');
  raises('format', { time: at('2026-01-01T00:00:00Z'), zone: 'Nowhere', locale: 'en', style: 'date' }, 'UnknownTimeZone');
});

test('formats at the medium length, in the zone and locale given', () => {
  const time = at('2026-11-21T09:30:00Z');
  const formatted = (zone: string, locale: string, style: string): string => call('format', { time, zone, locale, style }) as string;
  assert.equal(formatted('UTC', 'en', 'date'), new Intl.DateTimeFormat('en', { timeZone: 'UTC', dateStyle: 'medium' }).format(time));
  assert.equal(formatted('UTC', 'en', 'time'), new Intl.DateTimeFormat('en', { timeZone: 'UTC', timeStyle: 'medium' }).format(time));
  assert.equal(
    formatted('Asia/Tokyo', 'de', 'dateTime'),
    new Intl.DateTimeFormat('de', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'medium' }).format(time),
  );
  // A locale that isn't well formed falls back to en.
  assert.equal(formatted('UTC', 'not a locale!', 'date'), formatted('UTC', 'en', 'date'));
});

test('parses text written as a DATE_TIME literal is, and raises InvalidDateTime for anything else', () => {
  assert.equal(iso(call('parse', { text: '2026-11-21T09:30:00+01:00' })), '2026-11-21T08:30:00.000Z');
  for (const text of ['2026-02-30T00:00:00Z', '2026-11-21', 'tomorrow', '2026-11-21T09:30:00']) {
raises('parse', { text }, 'InvalidDateTime');
}
});
