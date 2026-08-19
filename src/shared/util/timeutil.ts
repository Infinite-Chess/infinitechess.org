// src/shared/util/timeutil.ts

/**
 * This script contains utility methods for working with dates and timestamps.
 */

import type { Locale } from 'date-fns';

import { formatDistanceToNow } from 'date-fns';

/**
 * Converts minutes to milliseconds.
 */
function minutesToMillis(minutes: number): number {
	return minutes * 60 * 1000;
}

/**
 * Converts seconds to milliseconds.
 */
function secondsToMillis(seconds: number): number {
	return seconds * 1000;
}

/**
 * Converts a timestamp to an object with UTCDate and UTCTime.
 * This time format is used for ICN metadata notation.
 * @param timestamp - The timestamp in milliseconds since the Unix Epoch.
 * @returns An object with the properties `UTCDate` and `UTCTime`.
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
 * @param [UTCTime] The time in the format "HH:MM:SS". Defaults to "00:00:00".
 * @returns The UTC timestamp in milliseconds since the Unix Epoch.
 */
function convertUTCDateUTCTimeToTimeStamp(UTCDate: string, UTCTime: string = '00:00:00'): number {
	const [year, month, day] = UTCDate.split('.').map(Number) as [number, number, number];
	const [hours, minutes, seconds] = UTCTime.split(':').map(Number) as [number, number, number];

	const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
	return date.getTime();
}

/**
 * Calculates the total milliseconds based on the provided options.
 * @param options - An object containing time units and their values.
 * @returns The total milliseconds calculated from the provided options.
 */
function getTotalMilliseconds(options: {
	milliseconds?: number;
	seconds?: number;
	minutes?: number;
	hours?: number;
	days?: number;
	weeks?: number;
	months?: number;
	years?: number;
}): number {
	const millisecondsIn = {
		milliseconds: 1,
		seconds: 1000,
		minutes: 1000 * 60,
		hours: 1000 * 60 * 60,
		days: 1000 * 60 * 60 * 24,
		weeks: 1000 * 60 * 60 * 24 * 7,
		months: 1000 * 60 * 60 * 24 * 30, // Approximation, not precise
		years: 1000 * 60 * 60 * 24 * 365, // Approximation, not precise
	};

	let totalMilliseconds = 0;

	for (const option in options) {
		if (millisecondsIn[option as keyof typeof millisecondsIn]) {
			totalMilliseconds +=
				(options[option as keyof typeof options] || 0) *
				millisecondsIn[option as keyof typeof millisecondsIn];
		}
	}

	return totalMilliseconds;
}

/**
 * Checks if the current date is within a specified date range.
 * @param startMonth - The starting month of the range (1-12).
 * @param startDay - The starting day of the range (1-31).
 * @param endMonth - The ending month of the range (1-12).
 * @param endDay - The ending day of the range (1-31).
 * @returns True if the current date is within the specified range; otherwise, false.
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
 * Converts an ISO 8601 string from `2026-06-23T14:30:07.000Z`
 * to a timestamp in milliseconds since the UNIX epoch.
 */
function isoToTimestamp(isoString: string): number {
	return new Date(isoString).getTime();
}

/**
 * Converts a SQLite DATETIME string (in "YYYY-MM-DD HH:MM:SS" format) to a UTC timestamp in milliseconds.
 * Assumes the SQLite timestamp is in UTC.
 * @param sqliteString - The DATETIME string from SQLite in the format "YYYY-MM-DD HH:MM:SS".
 * @returns The corresponding UTC timestamp in milliseconds since the UNIX epoch.
 */
function sqliteToTimestamp(sqliteString: string): number {
	const isoString = sqliteToISO(sqliteString);
	return Date.parse(isoString);
}

/**
 * Converts a SQLite DATETIME string (in "YYYY-MM-DD HH:MM:SS" format) to an ISO 8601 string.
 * Assumes the SQLite timestamp is in UTC.
 * @param sqliteString - The DATETIME string from SQLite in the format "YYYY-MM-DD HH:MM:SS".
 * @returns The corresponding ISO 8601 formatted string (e.g., "YYYY-MM-DDTHH:MM:SSZ").
 */
function sqliteToISO(sqliteString: string): string {
	return sqliteString.replace(' ', 'T') + 'Z';
}

/**
 * Converts an ISO 8601 string to SQLite's DATETIME format ("YYYY-MM-DD HH:MM:SS").
 * @param isoString - The ISO 8601 formatted string (e.g., "YYYY-MM-DDTHH:MM:SSZ").
 * @returns The corresponding SQLite DATETIME string (e.g., "YYYY-MM-DD HH:MM:SS").
 */
function isoToSQLite(isoString: string): string {
	const date = new Date(isoString);
	if (isNaN(date.getTime())) throw new Error('Invalid ISO 8601 string provided.');

	return date.toISOString().replace('T', ' ').split('.')[0]!;
}

/**
 * Converts a timestamp (milliseconds since the UNIX epoch) to SQLite's DATETIME format ("YYYY-MM-DD HH:MM:SS").
 * The output string represents the timestamp in UTC.
 * @param timestamp - The timestamp in milliseconds since the UNIX epoch.
 * @returns The corresponding SQLite DATETIME string (e.g., "YYYY-MM-DD HH:MM:SS").
 */
function timestampToSqlite(timestamp: number): string {
	const date = new Date(timestamp);

	// Check if the timestamp resulted in a valid date
	if (isNaN(date.getTime())) throw new Error('Invalid timestamp provided.');

	// toISOString() returns in UTC format "YYYY-MM-DDTHH:MM:SS.sssZ"
	// We need to format it to "YYYY-MM-DD HH:MM:SS"
	const isoString = date.toISOString();

	// Extract the date and time part, replace 'T' with space
	return isoString.slice(0, 19).replace('T', ' ');
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
 * Largest-first relative-time units with their length in ms.
 * Months/years use the conventional 30- and 365-day approximations.
 */
const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 1000 * 60 * 60 * 24 * 365],
	['month', 1000 * 60 * 60 * 24 * 30],
	['day', 1000 * 60 * 60 * 24],
	['hour', 1000 * 60 * 60],
	['minute', 1000 * 60],
	['second', 1000],
];

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

export default {
	minutesToMillis,
	secondsToMillis,
	convertTimestampToUTCDateUTCTime,
	convertUTCDateUTCTimeToTimeStamp,
	getTotalMilliseconds,
	isCurrentDateWithinRange,
	timestampToISO,
	isoToTimestamp,
	sqliteToTimestamp,
	sqliteToISO,
	isoToSQLite,
	timestampToSqlite,
	getRelativeTimeString,
	getRelativeTimeStringIntl,
};
