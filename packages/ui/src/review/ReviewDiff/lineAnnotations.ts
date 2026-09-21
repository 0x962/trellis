import type { ReviewFile } from "./parseReviewFiles";
import type { DiffAnchor, DiffThread } from "./ReviewDiff";

type DiffLineAnnotation = { side: "deletions" | "additions"; lineNumber: number; metadata: string };

// `drawn` answers whether the diff draws that line of that side. The diff
// draws every line of a hunk, and the lines of a gap that the reviewer
// opened. A thread on a line that the diff hides goes to the top of the
// file, where the line number 0 puts it.
export function lineAnnotations(
	file: ReviewFile,
	threads: DiffThread[],
	revisionId: string,
	composer: DiffAnchor | null,
	drawn: (side: "old" | "new", line: number) => boolean,
): DiffLineAnnotation[] {
	const annotations: DiffLineAnnotation[] = threads
		.filter((thread) => thread.path === file.name && thread.revisionId === revisionId)
		.map((thread) => ({
			side: thread.side === "old" ? "deletions" : "additions",
			lineNumber: drawn(thread.side, thread.line) ? thread.line : 0,
			metadata: thread.id,
		}));
	if (composer?.path === file.name)
		annotations.push({
			side: composer.side === "old" ? "deletions" : "additions",
			lineNumber: composer.line,
			metadata: "composer",
		});
	return annotations;
}
