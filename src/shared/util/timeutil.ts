// src/shared/util/timeutil.ts

/**
 * This script contains utility methods for working with dates and timestamps.
 */

import type { Locale } from 'date-fns';

import { formatDistanceToNow } from 'date-fns';

// Types -----------------------------------------------------------------------

/** A time unit convertible to milliseconds. */
type TimeUnit = keyof typeof MS_PER_UNIT;

// Constants -------------------------------------------------------------------

/**
 * The length of each time unit in milliseconds.
 * Months/years use the conventional 30- and 365-day approximations.
 */
const MS_PER_UNIT = {
	milliseconds: 1,
	seconds: 1000,
	minutes: 1000 * 60,
	hours: 1000 * 60 * 60,
	days: 1000 * 60 * 60 * 24,
	weeks: 1000 * 60 * 60 * 24 * 7,
	months: 1000 * 60 * 60 * 24 * 30,
	years: 1000 * 60 * 60 * 24 * 365,
};

/** Largest-first relative-time units with their length in ms. */
const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
	['year', MS_PER_UNIT.years],
	['month', MS_PER_UNIT.months],
	['day', MS_PER_UNIT.days],
	['hour', MS_PER_UNIT.hours],
	['minute', MS_PER_UNIT.minutes],
	['second', MS_PER_UNIT.seconds],
];

// Functions -------------------------------------------------------------------

/** Converts an amount of a time unit into milliseconds. */
function toMillis(amount: number, unit: TimeUnit): number {
	return amount * MS_PER_UNIT[unit];
}

/**
 * Converts a timestamp to the `UTCDate` / `UTCTime` pair ICN metadata notation uses.
 * @param timestamp - The timestamp in milliseconds since the Unix Epoch.
 */
function convertTimestampToUTCDateUTCTime(timestamp: number): { UTCDate: string; UTCTime: string } {
	const date = new Date(timestamp);

	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');

	const hours = String(date.getUTCHours()).padStart(2, '0');
	const minutes = String(date.getUTCMinutes()).padStart(2, '0');
	const seconds = String(date.getUTCSeconds()).padStart(2, '0');

	const UTCDate = `${year}.${month}.${day}`;
	const UTCTime = `${hours}:${minutes}:${seconds}`;

	return { UTCDate, UTCTime };
}

/**
 * Converts a UTCDate and optional UTCTime to a UTC timestamp in milliseconds since the Unix Epoch.
 * @param UTCDate - The date in the format "YYYY.MM.DD".
 * @param UTCTime - The time in the format "HH:MM:SS". Defaults to "00:00:00".
 */
function convertUTCDateUTCTimeToTimeStamp(UTCDate: string, UTCTime: string = '00:00:00'): number {
	const [year, month, day] = UTCDate.split('.').map(Number) as [number, number, number];
	const [hours, minutes, seconds] = UTCTime.split(':').map(Number) as [number, number, number];

	const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
	return date.getTime();
}

/**
 * Whether today falls inside the given month/day range of the current year.
 * @param startMonth - The starting month of the range (1-12).
 * @param startDay - The starting day of the range (1-31).
 * @param endMonth - The ending month of the range (1-12).
 * @param endDay - The ending day of the range (1-31).
 */
function isCurrentDateWithinRange(
	startMonth: number,
	startDay: number,
	endMonth: number,
	endDay: number,
): boolean {
	const currentDate = new Date();
	const today = new Date(
		currentDate.getFullYear(),
		currentDate.getMonth(),
		currentDate.getDate(),
	); // Normalized current date
	const startDate = new Date(currentDate.getFullYear(), startMonth - 1, startDay);
	const endDate = new Date(currentDate.getFullYear(), endMonth - 1, endDay);
	return today >= startDate && today <= endDate;
}

/**
 * Converts a timestamp (milliseconds since the UNIX epoch)
 * to an ISO 8601 string `2026-06-23T14:30:07.000Z`.
 */
function timestampToISO(timestamp: number): string {
	return new Date(timestamp).toISOString();
}

/**
 * Converts a SQLite DATETIME string ("YYYY-MM-DD HH:MM:SS", assumed UTC)
 * to a timestamp in milliseconds since the UNIX epoch.
 */
function sqliteToTimestamp(sqliteString: string): number {
	const isoString = sqliteToISO(sqliteString);
	return Date.parse(isoString);
}

/**
 * Converts a SQLite DATETIME string ("YYYY-MM-DD HH:MM:SS", assumed UTC)
 * to an ISO 8601 string.
 */
function sqliteToISO(sqliteString: string): string {
	return sqliteString.replace(' ', 'T') + 'Z';
}

/**
 * Converts a timestamp (milliseconds since the UNIX epoch) to SQLite's UTC
 * DATETIME format ("YYYY-MM-DD HH:MM:SS").
 * @throws If the timestamp is not a valid date.
 */
function timestampToSqlite(timestamp: number): string {
	const date = new Date(timestamp);
	if (isNaN(date.getTime())) throw new Error('Invalid timestamp provided.');

	// toISOString() gives "YYYY-MM-DDTHH:MM:SS.sssZ"; trim to "YYYY-MM-DD HH:MM:SS".
	return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Formats an epoch-ms timestamp as a relative "time ago" string (e.g. "2 minutes ago").
 * @param timestampMs - Epoch milliseconds.
 * @param locale - date-fns locale.
 */
function getRelativeTimeString(timestampMs: number, locale: Locale): string {
	return formatDistanceToNow(timestampMs, { addSuffix: true, locale });
}

/**
 * Formats an epoch-ms timestamp as a localized relative "time ago" string (e.g. "2 minutes ago")
 * via the native `Intl` API — unlike {@link getRelativeTimeString}, it needs no date-fns locale,
 * so it's usable client-side. On the client, pass `document.documentElement.lang` as the locale.
 * @param timestampMs - Epoch milliseconds.
 * @param locale - A BCP 47 language tag, e.g. "en-US".
 */
function getRelativeTimeStringIntl(timestampMs: number, locale: string): string {
	// Clamp clock skew to "0 seconds ago", in case the source clock is ahead of ours.
	const elapsed = Math.max(0, Date.now() - timestampMs);
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
	for (const [unit, unitMs] of RELATIVE_UNITS) {
		// A unit only kicks in once fully crossed, so e.g. 59m stays "X minutes ago", not hours.
		if (elapsed >= unitMs || unit === 'second') {
			// Rounded, not floored: e.g. 1h30m reads "2 hours ago".
			return formatter.format(-Math.round(elapsed / unitMs), unit);
		}
	}
	return ''; // Unreachable: the 'second' branch always returns.
}

/**
 * Selects the value from a time-versioned record whose key is the highest timestamp less
 * than or equal to the given timestamp. Falls back to the earliest entry if none apply.
 */
function resolveAtTimestamp<T>(entries: Record<number, T>, timestamp: number): T {
	const keys = Object.keys(entries)
		.map(Number)
		.sort((a, b) => b - a);
	return entries[keys.find((k) => timestamp >= k) ?? keys[keys.length - 1]!]!;
}

// Exports ---------------------------------------------------------------------

export default {
	toMillis,
	convertTimestampToUTCDateUTCTime,
	convertUTCDateUTCTimeToTimeStamp,
	isCurrentDateWithinRange,
	timestampToISO,
	sqliteToTimestamp,
	sqliteToISO,
	timestampToSqlite,
	getRelativeTimeString,
	getRelativeTimeStringIntl,
	resolveAtTimestamp,
};
