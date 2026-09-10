import { type SQL, sql } from "drizzle-orm";

// A plain word: letters and digits only. Any other character is either
// tsquery syntax (`&`, `|`, `!`, `:`, `*`, quotes, parentheses) or a
// separator that the text search parser splits on its own.
const plainWord = /^[\p{L}\p{N}]+$/u;

// The word websearch_to_tsquery reads as the OR operator, in any letter case.
const isOr = (token: string) => token.toLowerCase() === "or";

// The tsquery for a search box. Every leading token must match as a whole
// lexeme and the last token matches as a prefix. So `login auth` finds
// `Login authentication` while the person still types. `OR` binds weaker
// than the space between words, as in websearch_to_tsquery, so the prefix
// applies to the last AND group only: `login OR billing tok` is
// `login | (billing & tok:*)`. When the last token is not a plain word
// (`CDE-42`) or is `OR`, the whole text goes through websearch_to_tsquery,
// whose parser splits it the way the index did.
export const tsquery = (q: string): SQL => {
	const tokens = q.trim().split(/\s+/).filter(Boolean);
	const last = tokens.at(-1);
	if (last === undefined || !plainWord.test(last) || isOr(last)) {
		return sql`websearch_to_tsquery('english', ${q})`;
	}
	const prefix = sql`to_tsquery('english', ${`${last}:*`})`;
	const lastOr = tokens.findLastIndex(isOr);
	const head = lastOr === -1 ? [] : tokens.slice(0, lastOr);
	const group = tokens.slice(lastOr + 1, -1);
	const tail = group.length === 0 ? prefix : sql`(websearch_to_tsquery('english', ${group.join(" ")}) && ${prefix})`;
	return head.length === 0 ? tail : sql`(websearch_to_tsquery('english', ${head.join(" ")}) || ${tail})`;
};
