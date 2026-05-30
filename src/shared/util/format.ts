// src/shared/util/format.ts

/**
 * Substitutes `{key}` placeholders in a template string with values from `vars`.
 * Used to interpolate values into translation strings without locking word order.
 */
export function format(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) =>
		key in vars ? String(vars[key]) : `{${key}}`,
	);
}
