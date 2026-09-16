import type { DiffAnchor, DiffThread } from "./ReviewDiff";
import type { ReviewFile } from "./parseReviewFiles";

type DiffLineAnnotation = { side: "deletions" | "additions"; lineNumber: number; metadata: string };

export function lineAnnotations(
	file: ReviewFile,
	threads: DiffThread[],
	revisionId: string,
	composer: DiffAnchor | null,
	fullFile = false,
): DiffLineAnnotation[] {
	const annotations: DiffLineAnnotation[] = threads
		.filter((thread) => thread.path === file.name && thread.revisionId === revisionId)
		.map((thread) => {
			const shown = fullFile || file.hunks.some((hunk) =>
				thread.side === "old"
					? thread.line >= hunk.deletionStart && thread.line < hunk.deletionStart + hunk.deletionCount
					: thread.line >= hunk.additionStart && thread.line < hunk.additionStart + hunk.additionCount,
			);
			return {
				side: thread.side === "old" ? "deletions" : "additions",
				lineNumber: shown ? thread.line : 0,
				metadata: thread.id,
			};
		});
	if (composer?.path === file.name)
		annotations.push({
			side: composer.side === "old" ? "deletions" : "additions",
			lineNumber: composer.line,
			metadata: "composer",
		});
	return annotations;
}
