// The Resources tab lists the epic description as the first document. This id
// names that row. A resource id is a ULID, so it never equals this word.
export const PLAN_DOC_ID = "plan";

// A document with an empty title shows this word, as a new page does.
export const UNTITLED = "Untitled";

// The title of a document as the list draws it.
export const docTitle = (name: string): string => (name === "" ? UNTITLED : name);

// The epic description has no title field, so its row shows the text of the
// first markdown heading, at any level.
export const planTitle = (description: string): string => {
	const match = /^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(description);
	return match === null ? UNTITLED : match[1]!;
};
