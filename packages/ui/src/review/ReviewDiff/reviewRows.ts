import type { ThreadPlacement } from "./carryThreads";
import type { DiffGroupBand } from "./diffGroups";
import type { DiffRowHeights } from "./diffRowHeights";
import { lineAnnotations } from "./lineAnnotations";
import type { ReviewFile, ReviewHunk } from "./parseReviewFiles";
import type { DiffAnchor, DiffThread } from "./ReviewDiff";

export type ReviewDiffLine = {
	type: "context" | "addition" | "deletion";
	text: string;
	oldLine?: number;
	newLine?: number;
};

// How many lines one press of an expand control opens. A gap that hides
// this many lines or fewer offers one control that opens all of them.
export const EXPAND_LINES = 20;

// How many lines of one gap the reviewer opened. `top` counts lines down
// from the first line of the gap. `bottom` counts lines up from the last
// line of the gap.
export type GapReveal = { top: number; bottom: number };

// A gap is the run of unchanged lines that the patch leaves out. The gap
// above hunk number `index` has that index, and the gap after the last hunk
// has the index `file.hunks.length`.
export type ExpandedFile = {
	oldLines?: string[];
	newLines?: string[];
	// The "Show full file" toggle of the file header is on, so every gap
	// draws all of its lines.
	full: boolean;
	gaps: ReadonlyMap<number, GapReveal>;
};

// The expand controls that one gap offers, for the row that sits in it.
// `hidden` is null while the file contents are not loaded and the number of
// lines in the gap is still unknown.
export type GapControls = {
	index: number;
	hidden: number | null;
	// Opens the lines above the gap row, which are the lines under the hunk
	// that comes before the gap.
	down: boolean;
	// Opens the lines under the gap row, which are the lines above the hunk
	// that comes after the gap.
	up: boolean;
	// Opens every line the gap still hides.
	all: boolean;
};

export type ReviewRow =
	| { kind: "group"; key: string; band: DiffGroupBand }
	| { kind: "file"; key: string; file: ReviewFile }
	| { kind: "hunk"; key: string; file: ReviewFile; specs: string | null; gap: GapControls | null }
	| { kind: "unified"; key: string; file: ReviewFile; line: ReviewDiffLine; annotations: string[] }
	| {
			kind: "split";
			key: string;
			file: ReviewFile;
			oldLine?: ReviewDiffLine;
			newLine?: ReviewDiffLine;
			oldAnnotations: string[];
			newAnnotations: string[];
	  }
	| { kind: "annotation"; key: string; file: ReviewFile; annotations: string[] }
	| { kind: "notice"; key: string; file: ReviewFile; text: string }
	| { kind: "end"; key: string; file: ReviewFile };

const text = (value: string) => value.replace(/\r?\n$/, "");

const hunkLines = (file: ReviewFile, hunk: ReviewHunk): ReviewDiffLine[] =>
	hunk.hunkContent.flatMap<ReviewDiffLine>((content): ReviewDiffLine[] => {
		if (content.type === "context")
			return Array.from({ length: content.lines }, (_, index) => ({
				type: "context" as const,
				text: text(file.additionLines[content.additionLineIndex + index]!),
				oldLine: hunk.deletionStart + content.deletionLineIndex + index - hunk.deletionLineIndex,
				newLine: hunk.additionStart + content.additionLineIndex + index - hunk.additionLineIndex,
			}));
		return [
			...Array.from({ length: content.deletions }, (_, index) => ({
				type: "deletion" as const,
				text: text(file.deletionLines[content.deletionLineIndex + index]!),
				oldLine: hunk.deletionStart + content.deletionLineIndex + index - hunk.deletionLineIndex,
			})),
			...Array.from({ length: content.additions }, (_, index) => ({
				type: "addition" as const,
				text: text(file.additionLines[content.additionLineIndex + index]!),
				newLine: hunk.additionStart + content.additionLineIndex + index - hunk.additionLineIndex,
			})),
		];
	});

const splitLines = (lines: ReviewDiffLine[]): [ReviewDiffLine | undefined, ReviewDiffLine | undefined][] => {
	const rows: [ReviewDiffLine | undefined, ReviewDiffLine | undefined][] = [];
	for (let index = 0; index < lines.length; ) {
		const line = lines[index]!;
		if (line.type === "context") {
			rows.push([line, line]);
			index += 1;
			continue;
		}
		const deletions: ReviewDiffLine[] = [];
		const additions: ReviewDiffLine[] = [];
		while (lines[index]?.type === "deletion") deletions.push(lines[index++]!);
		while (lines[index]?.type === "addition") additions.push(lines[index++]!);
		const count = Math.max(deletions.length, additions.length);
		for (let row = 0; row < count; row++) rows.push([deletions[row], additions[row]]);
	}
	return rows;
};

const contextLines = (contents: ExpandedFile, oldStart: number, oldEnd: number, newStart: number, newEnd: number) => {
	const count = Math.max(oldEnd - oldStart, newEnd - newStart);
	return Array.from({ length: count }, (_, index): ReviewDiffLine => {
		const oldLine = oldStart + index < oldEnd ? oldStart + index : undefined;
		const newLine = newStart + index < newEnd ? newStart + index : undefined;
		const oldText = oldLine === undefined ? undefined : contents.oldLines?.[oldLine - 1];
		const newText = newLine === undefined ? undefined : contents.newLines?.[newLine - 1];
		return { type: "context", text: newText === undefined ? oldText! : newText, oldLine, newLine };
	});
};

type Section = { key: string; specs?: string; gap?: GapControls; lines: ReviewDiffLine[] };

// The lines of a gap that the diff draws. Without the file contents the
// diff draws none of them, because it has no text to draw. The counts stay
// inside the gap, so a press that asks for more lines than the gap holds
// opens the gap and stops there.
const revealed = (contents: ExpandedFile | undefined, index: number, length: number): GapReveal => {
	if (contents === undefined) return { top: 0, bottom: 0 };
	if (contents.full) return { top: length, bottom: 0 };
	const reveal = contents.gaps.get(index) ?? { top: 0, bottom: 0 };
	const top = Math.min(reveal.top, length);
	return { top, bottom: Math.min(reveal.bottom, length - top) };
};

// A gap of 20 lines or fewer offers one control that opens all of it, and
// GitHub does the same.
const controls = (index: number, hidden: number | null, down: boolean, up: boolean): GapControls =>
	hidden !== null && hidden <= EXPAND_LINES
		? { index, hidden, down: false, up: false, all: true }
		: { index, hidden, down, up, all: false };

// The rows of one file, in order: the lines the reviewer opened at the top
// of each gap, the row of the gap itself, the lines the reviewer opened at
// the bottom of the gap, and the lines of the hunk.
const sections = (file: ReviewFile, contents: ExpandedFile | undefined, expandable: boolean): Section[] => {
	const result: Section[] = [];
	// An added file has no old side and a deleted file has no new side, so
	// neither file has a gap between its hunks.
	const gapped = expandable && file.type !== "new" && file.type !== "deleted";
	let oldLine = 1;
	let newLine = 1;
	file.hunks.forEach((hunk, index) => {
		const length = Math.max(0, Math.min(hunk.deletionStart - oldLine, hunk.additionStart - newLine));
		const reveal = revealed(contents, index, length);
		const hidden = length - reveal.top - reveal.bottom;
		if (reveal.top > 0)
			result.push({
				key: `top:${index}`,
				lines: contextLines(contents!, oldLine, oldLine + reveal.top, newLine, newLine + reveal.top),
			});
		result.push({
			key: `hunk:${index}`,
			specs: hunk.hunkSpecs,
			// The first hunk of a file has no hunk above it, so its gap opens
			// upward only.
			...(gapped && hidden > 0 ? { gap: controls(index, hidden, index > 0, true) } : {}),
			lines: [
				...(reveal.bottom > 0
					? contextLines(
							contents!,
							hunk.deletionStart - reveal.bottom,
							hunk.deletionStart,
							hunk.additionStart - reveal.bottom,
							hunk.additionStart,
						)
					: []),
				...hunkLines(file, hunk),
			],
		});
		oldLine = hunk.deletionStart + hunk.deletionCount;
		newLine = hunk.additionStart + hunk.additionCount;
	});
	if (file.hunks.length === 0) return result;
	const index = file.hunks.length;
	const length =
		contents === undefined
			? null
			: Math.max(
					0,
					Math.min((contents.oldLines?.length ?? 0) + 1 - oldLine, (contents.newLines?.length ?? 0) + 1 - newLine),
				);
	const reveal = revealed(contents, index, length ?? 0);
	if (reveal.top > 0)
		result.push({
			key: `top:${index}`,
			lines: contextLines(contents!, oldLine, oldLine + reveal.top, newLine, newLine + reveal.top),
		});
	// The diff learns the length of the file from the first load, so the row
	// after the last hunk offers to open the end of the file before it knows
	// that the last hunk already reaches it.
	const hidden = length === null ? null : length - reveal.top;
	if (gapped && (hidden === null || hidden > 0))
		result.push({ key: `hunk:${index}`, gap: controls(index, hidden, true, false), lines: [] });
	return result;
};

const annotationKey = (side: "old" | "new", line: number) => `${side}:${line}`;

// The text of every line the diff draws for one file, by side and line
// number. A thread written against an earlier revision searches this text
// for the lines it was written against.
export const drawnLineText = (file: ReviewFile, contents: ExpandedFile | undefined) => {
	const text = { old: new Map<number, string>(), new: new Map<number, string>() };
	for (const section of sections(file, contents, true))
		for (const line of section.lines) {
			if (line.oldLine !== undefined) text.old.set(line.oldLine, line.text);
			if (line.newLine !== undefined) text.new.set(line.newLine, line.text);
		}
	return text;
};

export function buildReviewRows(
	files: ReviewFile[],
	mode: "split" | "unified",
	threads: DiffThread[],
	places: ReadonlyMap<string, ThreadPlacement>,
	composer: DiffAnchor | null,
	expanded: ReadonlyMap<string, ExpandedFile>,
	expandable: boolean,
	viewed: ReadonlySet<string>,
	bands: ReadonlyMap<string, DiffGroupBand>,
) {
	const rows: ReviewRow[] = [];
	for (const file of files) {
		const band = bands.get(file.name);
		if (band !== undefined) rows.push({ kind: "group", key: `${band.key}:group`, band });
		rows.push({ kind: "file", key: `${file.name}:file`, file });
		// A file the person marked read keeps its header and loses every other
		// row, so the files that are left sit close together.
		if (viewed.has(file.name)) {
			rows.push({ kind: "end", key: `${file.name}:end`, file });
			continue;
		}
		// Git writes no line for a binary file. Without this row the file draws
		// as a header over nothing, which reads as a file that changed nothing.
		if (file.binary) {
			rows.push({
				kind: "notice",
				key: `${file.name}:notice`,
				file,
				text: "Git stores this file as bytes, so the diff has no lines to show.",
			});
			rows.push({ kind: "end", key: `${file.name}:end`, file });
			continue;
		}
		const fileSections = sections(file, expanded.get(file.name), expandable);
		const drawn = new Set<string>();
		for (const section of fileSections)
			for (const line of section.lines) {
				if (line.oldLine !== undefined) drawn.add(annotationKey("old", line.oldLine));
				if (line.newLine !== undefined) drawn.add(annotationKey("new", line.newLine));
			}
		const annotations = new Map<string, string[]>();
		for (const annotation of lineAnnotations(file, threads, places, composer, (side, line) =>
			drawn.has(annotationKey(side, line)),
		)) {
			const side = annotation.side === "deletions" ? "old" : "new";
			const key = annotationKey(side, annotation.lineNumber);
			annotations.set(key, [...(annotations.get(key) ?? []), annotation.metadata]);
		}
		const fileAnnotations = [
			...(annotations.get(annotationKey("old", 0)) ?? []),
			...(annotations.get(annotationKey("new", 0)) ?? []),
		];
		if (fileAnnotations.length > 0)
			rows.push({ kind: "annotation", key: `${file.name}:annotations`, file, annotations: fileAnnotations });
		// An added file has no old side and a deleted file has no new side, so
		// split mode draws them in one column across the full width.
		const fileMode = file.type === "new" || file.type === "deleted" ? "unified" : mode;
		let lineIndex = 0;
		for (const section of fileSections) {
			if (section.specs !== undefined || section.gap !== undefined)
				rows.push({
					kind: "hunk",
					key: `${file.name}:${section.key}`,
					file,
					specs: section.specs ?? null,
					gap: section.gap ?? null,
				});
			if (fileMode === "split") {
				for (const [oldLine, newLine] of splitLines(section.lines)) {
					rows.push({
						kind: "split",
						key: `${file.name}:line:${lineIndex++}`,
						file,
						oldLine,
						newLine,
						oldAnnotations: oldLine?.oldLine ? (annotations.get(annotationKey("old", oldLine.oldLine)) ?? []) : [],
						newAnnotations: newLine?.newLine ? (annotations.get(annotationKey("new", newLine.newLine)) ?? []) : [],
					});
				}
				continue;
			}
			for (const line of section.lines) {
				const lineAnnotations = [
					...(line.oldLine ? (annotations.get(annotationKey("old", line.oldLine)) ?? []) : []),
					...(line.newLine ? (annotations.get(annotationKey("new", line.newLine)) ?? []) : []),
				];
				rows.push({
					kind: "unified",
					key: `${file.name}:line:${lineIndex++}`,
					file,
					line,
					annotations: lineAnnotations,
				});
			}
		}
		rows.push({ kind: "end", key: `${file.name}:end`, file });
	}
	return rows;
}

// The annotations a line row stacks under itself: a thread or the
// composer, on one side or both.
export const rowAnnotations = (row: ReviewRow) =>
	row.kind === "unified"
		? row.annotations.length
		: row.kind === "split"
			? Math.max(row.oldAnnotations.length, row.newAnnotations.length)
			: 0;

// The height a row of a comment thread, of the composer, or of the notice of a
// binary file starts from. Each of those wraps its own text, so each reports
// its real height once it draws.
const MEASURED_ROW_GUESS = 120;

// The height in pixels a row takes. `heights` comes from `diffRowHeights`, and
// the stylesheet draws each of these rows at the same number, so the height
// this returns is the height the row draws. A row that holds a comment thread
// or the composer is the one exception: it starts from a guess and reports its
// real height once it draws.
export const reviewRowSize = (row: ReviewRow, heights: DiffRowHeights) => {
	if (row.kind === "group") return heights.group;
	if (row.kind === "file") return heights.file;
	if (row.kind === "hunk") return heights.hunk;
	if (row.kind === "end") return heights.end;
	if (row.kind === "annotation" || row.kind === "notice") return MEASURED_ROW_GUESS;
	return heights.line + MEASURED_ROW_GUESS * rowAnnotations(row);
};

// The text of the lines from `startLine` to `line` on the side of the
// anchor, or null when the view does not show one of them. A deletion has
// no new-side number and an addition has no old-side number, so each side
// reads its own lines only.
export const anchorLines = (
	files: ReviewFile[],
	expanded: ReadonlyMap<string, ExpandedFile>,
	anchor: DiffAnchor,
): string[] | null => {
	const file = files.find((candidate) => candidate.name === anchor.path);
	if (file === undefined) return null;
	const byNumber = new Map<number, string>();
	for (const section of sections(file, expanded.get(file.name), false))
		for (const line of section.lines) {
			const number = anchor.side === "old" ? line.oldLine : line.newLine;
			if (number !== undefined) byNumber.set(number, line.text);
		}
	const lines: string[] = [];
	for (let number = anchor.startLine; number <= anchor.line; number += 1) {
		const text = byNumber.get(number);
		if (text === undefined) return null;
		lines.push(text);
	}
	return lines;
};
