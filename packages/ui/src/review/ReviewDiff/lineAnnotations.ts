import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import type { DiffAnchor, DiffThread } from "./ReviewDiff";

export function lineAnnotations(
	file: FileDiffMetadata,
	threads: DiffThread[],
	revisionId: string,
	composer: DiffAnchor | null,
): DiffLineAnnotation<string>[] {
	const annotations: DiffLineAnnotation<string>[] = threads
		.filter((thread) => thread.path === file.name && thread.revisionId === revisionId)
		.map((thread) => {
			const shown = file.hunks.some((hunk) =>
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
