import { lineAnnotations } from "./lineAnnotations";
import type { ReviewFile, ReviewHunk } from "./parseReviewFiles";
import type { DiffAnchor, DiffThread } from "./ReviewDiff";

export type ReviewDiffLine = {
	type: "context" | "addition" | "deletion";
	text: string;
	oldLine?: number;
	newLine?: number;
};

export type ExpandedFile = { oldLines?: string[]; newLines?: string[] };

export type ReviewRow =
	| { kind: "file"; key: string; file: ReviewFile }
	| { kind: "hunk"; key: string; file: ReviewFile; specs: string }
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

type Section = { specs?: string; lines: ReviewDiffLine[] };

const sections = (file: ReviewFile, contents?: ExpandedFile): Section[] => {
	if (!contents) return file.hunks.map((hunk) => ({ specs: hunk.hunkSpecs, lines: hunkLines(file, hunk) }));
	const result: Section[] = [];
	let oldLine = 1;
	let newLine = 1;
	for (const hunk of file.hunks) {
		const gap = contextLines(contents, oldLine, hunk.deletionStart, newLine, hunk.additionStart);
		if (gap.length > 0) result.push({ lines: gap });
		result.push({ specs: hunk.hunkSpecs, lines: hunkLines(file, hunk) });
		oldLine = hunk.deletionStart + hunk.deletionCount;
		newLine = hunk.additionStart + hunk.additionCount;
	}
	const tail = contextLines(
		contents,
		oldLine,
		(contents.oldLines?.length ?? 0) + 1,
		newLine,
		(contents.newLines?.length ?? 0) + 1,
	);
	if (tail.length > 0) result.push({ lines: tail });
	return result;
};

const annotationKey = (side: "old" | "new", line: number) => `${side}:${line}`;

export function buildReviewRows(
	files: ReviewFile[],
	mode: "split" | "unified",
	threads: DiffThread[],
	revisionId: string,
	composer: DiffAnchor | null,
	expanded: ReadonlyMap<string, ExpandedFile>,
) {
	const rows: ReviewRow[] = [];
	for (const file of files) {
		rows.push({ kind: "file", key: `${file.name}:file`, file });
		const annotations = new Map<string, string[]>();
		for (const annotation of lineAnnotations(file, threads, revisionId, composer, expanded.has(file.name))) {
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
		let lineIndex = 0;
		for (const section of sections(file, expanded.get(file.name))) {
			if (section.specs) rows.push({ kind: "hunk", key: `${file.name}:hunk:${lineIndex}`, file, specs: section.specs });
			if (mode === "split") {
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

// The height estimate the virtual list starts from. A row with an
// annotation reports its real height once it mounts.
export const reviewRowSize = (row: ReviewRow) =>
	row.kind === "file" ? 48 : row.kind === "annotation" ? 120 : row.kind === "end" ? 16 : 24 + 120 * rowAnnotations(row);

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
	for (const section of sections(file, expanded.get(file.name)))
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
