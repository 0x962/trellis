export type HoldMarksStorage = Pick<Storage, "getItem" | "setItem">;
export type HoldMarks = Record<string, string>;

const storageKey = (pr: string) => `trellis.review.focus:${pr}`;
const markKey = (sentence: string, index: number) => `${index}:${sentence}`;

export const isHeld = (marks: HoldMarks, sentence: string, index: number, revisionId: string) =>
	marks[markKey(sentence, index)] === revisionId;

export const loadHoldMarks = (storage: HoldMarksStorage, pr: string): HoldMarks =>
	JSON.parse(storage.getItem(storageKey(pr)) ?? "{}") as HoldMarks;

export function setHoldMark(
	storage: HoldMarksStorage,
	pr: string,
	marks: HoldMarks,
	sentence: string,
	index: number,
	revisionId: string,
	hold: boolean,
): HoldMarks {
	const next = { ...marks };
	const key = markKey(sentence, index);
	if (hold) next[key] = revisionId;
	else delete next[key];
	storage.setItem(storageKey(pr), JSON.stringify(next));
	return next;
}
