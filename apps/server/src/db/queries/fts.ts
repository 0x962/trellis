import { type SQL, sql } from "drizzle-orm";

// A plain word: letters and digits only. Any other character is either
// tsquery syntax (`&`, `|`, `!`, `:`, `*`, quotes, parentheses) or a
// separator that the text search parser splits on its own.
const plainWord = /^[\p{L}\p{N}]+$/u;

// The tsquery for a search box. Every leading token must match as a whole
// lexeme; the last token matches as a prefix, so `login auth` finds
// `Login authentication` while the person still types. When the last token
// is not a plain word (`CDE-42`), the whole text goes through
// websearch_to_tsquery, whose parser splits it the way the index did.
export const tsquery = (q: string): SQL => {
	const tokens = q.trim().split(/\s+/).filter(Boolean);
	const last = tokens.at(-1);
	if (last === undefined || !plainWord.test(last)) return sql`websearch_to_tsquery('english', ${q})`;
	const prefix = sql`to_tsquery('english', ${`${last}:*`})`;
	if (tokens.length === 1) return prefix;
	const leading = tokens.slice(0, -1).join(" ");
	return sql`(websearch_to_tsquery('english', ${leading}) && ${prefix})`;
};
