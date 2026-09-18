// A suggestion is a fenced code block whose info string is `suggestion`.
// Its lines replace the lines of the thread anchor, and an empty block
// deletes them. GitHub renders the same block as a suggested change, so a
// body that carries one reads the same in both places.

export type SuggestionBlock = { lines: string[] };

export type BodySegment = { kind: "markdown"; text: string } | { kind: "suggestion"; lines: string[] };

const openFence = /^ {0,3}(`{3,}|~{3,})[ \t]*suggestion[ \t]*$/i;

// Reads the body as CommonMark reads a fenced block: the closing fence
// uses the same character, is at least as long as the opening fence, and
// stands alone on its line. A block that never closes is markdown.
export function splitSuggestionBody(body: string): BodySegment[] {
	const lines = body.split(/\r?\n/);
	const segments: BodySegment[] = [];
	let markdown: string[] = [];
	const flush = () => {
		if (markdown.length > 0) segments.push({ kind: "markdown", text: markdown.join("\n") });
		markdown = [];
	};
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]!;
		const open = openFence.exec(line);
		if (open === null) {
			markdown.push(line);
			continue;
		}
		const marker = open[1]!;
		const closeFence = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*$`);
		const end = lines.findIndex((candidate, at) => at > index && closeFence.test(candidate));
		if (end === -1) {
			markdown.push(line);
			continue;
		}
		flush();
		segments.push({ kind: "suggestion", lines: lines.slice(index + 1, end) });
		index = end;
	}
	flush();
	return segments;
}

export function parseSuggestions(body: string): SuggestionBlock[] {
	return splitSuggestionBody(body).flatMap((segment) =>
		segment.kind === "suggestion" ? [{ lines: segment.lines }] : [],
	);
}

const longestRun = (text: string, char: string) => {
	let longest = 0;
	let current = 0;
	for (const value of text) {
		current = value === char ? current + 1 : 0;
		if (current > longest) longest = current;
	}
	return longest;
};

// The block a composer inserts for the selected lines. The fence is longer
// than any backtick run inside the lines, so the lines cannot close it.
export function suggestionBlock(lines: string[]): string {
	const marker = "`".repeat(Math.max(3, ...lines.map((line) => longestRun(line, "`") + 1)));
	return `${marker}suggestion\n${lines.map((line) => `${line}\n`).join("")}${marker}`;
}

// One line of the mini diff a suggestion widget draws. `marks` are the
// character ranges of a replaced line that differ from its counterpart.
export type SuggestionDiffLine = {
	type: "context" | "deletion" | "addition";
	text: string;
	marks?: [number, number][];
};

// The longest common subsequence of two arrays, as index pairs in order.
const commonSubsequence = <T>(left: T[], right: T[], same: (a: T, b: T) => boolean): [number, number][] => {
	const table: number[][] = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
	for (let i = left.length - 1; i >= 0; i -= 1)
		for (let j = right.length - 1; j >= 0; j -= 1)
			table[i]![j] = same(left[i]!, right[j]!)
				? table[i + 1]![j + 1]! + 1
				: Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
	const pairs: [number, number][] = [];
	let i = 0;
	let j = 0;
	while (i < left.length && j < right.length) {
		if (same(left[i]!, right[j]!)) {
			pairs.push([i, j]);
			i += 1;
			j += 1;
		} else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1;
		else j += 1;
	}
	return pairs;
};

const tokens = (text: string) => text.match(/\s+|\w+|[^\s\w]/g) ?? [];

// The character ranges of `text` that its token sequence does not share
// with `other`.
const changedRanges = (text: string, other: string): [number, number][] => {
	const own = tokens(text);
	const shared = new Set(commonSubsequence(own, tokens(other), (a, b) => a === b).map(([index]) => index));
	const ranges: [number, number][] = [];
	let offset = 0;
	for (const [index, token] of own.entries()) {
		const end = offset + token.length;
		if (!shared.has(index)) {
			const last = ranges.at(-1);
			if (last !== undefined && last[1] === offset) last[1] = end;
			else ranges.push([offset, end]);
		}
		offset = end;
	}
	return ranges;
};

// The line diff between the original lines and the suggested lines. A run
// of deletions followed by the same count of additions pairs line by line,
// and each pair carries the marks of its changed tokens.
export function suggestionDiff(original: string[], suggested: string[]): SuggestionDiffLine[] {
	const pairs = commonSubsequence(original, suggested, (a, b) => a === b);
	const lines: SuggestionDiffLine[] = [];
	let i = 0;
	let j = 0;
	const flush = (untilI: number, untilJ: number) => {
		const deletions = original.slice(i, untilI);
		const additions = suggested.slice(j, untilJ);
		const paired = deletions.length === additions.length;
		for (const [index, text] of deletions.entries())
			lines.push({ type: "deletion", text, ...(paired ? { marks: changedRanges(text, additions[index]!) } : {}) });
		for (const [index, text] of additions.entries())
			lines.push({ type: "addition", text, ...(paired ? { marks: changedRanges(text, deletions[index]!) } : {}) });
	};
	for (const [oi, sj] of pairs) {
		flush(oi, sj);
		lines.push({ type: "context", text: original[oi]! });
		i = oi + 1;
		j = sj + 1;
	}
	flush(original.length, suggested.length);
	return lines;
}

export type SuggestionEdit = { startLine: number; line: number; lines: string[] };

// True when two edits touch a common line. One commit takes at most one
// suggestion per line.
export const suggestionEditsOverlap = (edits: SuggestionEdit[]) =>
	edits.some((edit, index) =>
		edits.slice(index + 1).some((other) => edit.startLine <= other.line && other.startLine <= edit.line),
	);

// The file lines after every edit. Each edit replaces the lines from its
// startLine to its line, both 1-based and inclusive. Later lines go first,
// so an earlier edit never moves a later one.
export function applySuggestionEdits(fileLines: string[], edits: SuggestionEdit[]): string[] {
	const result = [...fileLines];
	for (const edit of [...edits].sort((a, b) => b.startLine - a.startLine))
		result.splice(edit.startLine - 1, edit.line - edit.startLine + 1, ...edit.lines);
	return result;
}

// The line ending a file uses, from its first line break.
export const lineEndingOf = (content: string) => content.match(/\r\n|\n/)?.[0] ?? "\n";

// The lines of a file as a suggestion counts them. A trailing line break
// closes the last line and adds no empty line.
export const splitFileLines = (content: string) => {
	const lines = content.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();
	return lines;
};

export const joinFileLines = (lines: string[], ending: string, trailingBreak: boolean) =>
	lines.join(ending) + (trailingBreak && lines.length > 0 ? ending : "");
