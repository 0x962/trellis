import type { Node } from "@tiptap/pm/model";
import { RESOURCE_COMMENT_CONTEXT_MAX, type ResourceCommentAnchor } from "@trellis/api";

// The text of a document, as one string, with the document position of each
// character. A newline stands between two text blocks, at the position of the
// second block, so a quote that spans blocks reads as the lines it covers.
export type DocText = { text: string; positions: number[] };

export type Range = { from: number; to: number };

export const docText = (doc: Node): DocText => {
	let text = "";
	const positions: number[] = [];
	doc.descendants((node, pos) => {
		if (node.isTextblock && text !== "") {
			text += "\n";
			positions.push(pos);
		}
		if (!node.isText) return true;
		for (let offset = 0; offset < node.text!.length; offset++) positions.push(pos + offset);
		text += node.text;
		return false;
	});
	return { text, positions };
};

// The index of the first character at or after `pos`.
const indexAt = (positions: number[], pos: number) => {
	let low = 0;
	let high = positions.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (positions[middle]! < pos) low = middle + 1;
		else high = middle;
	}
	return low;
};

// The anchor of the text between `from` and `to`. The newlines at the two
// ends of a selection that starts or stops at a block edge are not part of
// the quote. A range that holds no text has no anchor.
export const anchorOf = ({ text, positions }: DocText, { from, to }: Range): ResourceCommentAnchor | null => {
	let start = indexAt(positions, from);
	let end = indexAt(positions, to);
	while (start < end && text[start] === "\n") start++;
	while (end > start && text[end - 1] === "\n") end--;
	if (start === end) return null;
	return {
		quote: text.slice(start, end),
		prefix: text.slice(Math.max(0, start - RESOURCE_COMMENT_CONTEXT_MAX), start),
		suffix: text.slice(end, end + RESOURCE_COMMENT_CONTEXT_MAX),
	};
};

const sharedTail = (a: string, b: string) => {
	let count = 0;
	while (count < a.length && count < b.length && a[a.length - 1 - count] === b[b.length - 1 - count]) count++;
	return count;
};

const sharedHead = (a: string, b: string) => {
	let count = 0;
	while (count < a.length && count < b.length && a[count] === b[count]) count++;
	return count;
};

// The range of the quote in the document. Each place that holds the quote
// scores the characters of the prefix and of the suffix that still stand
// next to it, and the highest score wins. `exact` takes only a place where
// the whole prefix and the whole suffix stand, as after an undo that puts
// deleted text back. No place holds the quote when an edit changed it.
export const findAnchor = (
	{ text, positions }: DocText,
	anchor: ResourceCommentAnchor,
	exact: boolean,
): Range | null => {
	let best: { index: number; score: number } | null = null;
	for (let index = text.indexOf(anchor.quote); index !== -1; index = text.indexOf(anchor.quote, index + 1)) {
		const before = text.slice(Math.max(0, index - anchor.prefix.length), index);
		const after = text.slice(index + anchor.quote.length, index + anchor.quote.length + anchor.suffix.length);
		const score = sharedTail(before, anchor.prefix) + sharedHead(after, anchor.suffix);
		if (exact && score < anchor.prefix.length + anchor.suffix.length) continue;
		if (best === null || score > best.score) best = { index, score };
	}
	if (best === null) return null;
	return { from: positions[best.index]!, to: positions[best.index + anchor.quote.length - 1]! + 1 };
};
