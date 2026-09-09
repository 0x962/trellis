import { z } from "zod";

// A ULID is 26 Crockford base32 characters (no I, L, O, U). The first
// character is 0 to 7 because the 48-bit timestamp fills at most 50 bits.
// Every trellis row id travels upper-case on the wire.
export const ulidPattern = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const UlidSchema = z.string().regex(ulidPattern, "Expected a 26-character upper-case ULID.");

// Timestamps travel as ISO 8601 strings. The server writes `Z`; a client may
// send an offset in a filter bound.
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

// A root project key. Tickets are `KEY-n` across the whole project tree.
export const keyPattern = /^[A-Z][A-Z0-9]{1,9}$/;

export const KeySchema = z
	.string()
	.regex(keyPattern, "Expected a project key: an upper-case letter and 1 to 9 upper-case letters or digits.");

// A sub-project slug. `board` and `settings` are web routes under a project
// path, so a sub-project cannot take those names.
export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const reservedSlugs: ReadonlySet<string> = new Set(["board", "settings"]);

export const SlugSchema = z
	.string()
	.regex(slugPattern, "Expected a slug: lower-case letters, digits, and single dashes.")
	.refine((slug) => !reservedSlugs.has(slug), "This slug is a web route and is reserved.");

export const splitCommaList = (value: string) => (value === "" ? [] : value.split(","));

// A list filter arrives as an array from a typed client and as one
// comma-separated string from a URL or a CLI flag. Both forms parse to the
// same array.
export const commaList = <T extends z.ZodType>(item: T) =>
	z.preprocess(
		(value: string | z.input<T>[]) => (typeof value === "string" ? splitCommaList(value) : value),
		z.array(item),
	);

// A boolean query parameter arrives as the strings `true` or `false` from a
// URL. `z.coerce.boolean()` reads `"false"` as true, so the strings map by name.
export const booleanString = z.preprocess(
	(value: boolean | "true" | "false") => (value === "true" ? true : value === "false" ? false : value),
	z.boolean(),
);

// A count on the wire is a whole number that is never negative.
export const CountSchema = z.number().int().nonnegative();
