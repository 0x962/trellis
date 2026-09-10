import type { ReactNode } from "react";

const escapeRegex = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Splits `text` so each word of the query, in any case, sits in a mark. A
// query with no word returns the text as it is.
export const highlight = (text: string, query: string): ReactNode[] => {
	const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
	if (terms.length === 0) return [text];
	const pattern = new RegExp(`(${terms.join("|")})`, "gi");
	return text.split(pattern).map((part, index) =>
		index % 2 === 1 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: the parts of one string never reorder.
			<mark key={index} className="rounded-sm bg-warning-soft text-fg">
				{part}
			</mark>
		) : (
			part
		),
	);
};
