// src/shared/util/interpolate.ts

/**
 * Substitutes `{key}` placeholders in a template string with values from `vars`.
 * Used to interpolate values into translation strings without locking word order.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) =>
		key in vars ? String(vars[key]) : `{${key}}`,
	);
}

/**
 * Splits a template either side of one `{key}` placeholder, for when what fills it isn't text
 * — icons, elements — and so can't be interpolated in. Other placeholders are left untouched.
 */
export function splitAroundPlaceholder(template: string, key: string): [string, string] {
	const [before, after = ''] = template.split(`{${key}}`);
	return [before!, after];
}
