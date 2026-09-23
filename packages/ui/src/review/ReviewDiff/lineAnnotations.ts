import type { ThreadPlacement } from "./carryThreads";
import type { ReviewFile } from "./parseReviewFiles";
import type { DiffAnchor, DiffThread } from "./ReviewDiff";

type DiffLineAnnotation = { side: "deletions" | "additions"; lineNumber: number; metadata: string };

// `drawn` answers whether the diff draws that line of that side. The diff
// draws every line of a hunk, and the lines of a gap that the reviewer
// opened. A thread on a line that the diff hides goes to the top of the
// file, where the line number 0 puts it. An outdated thread goes there too:
// the file on screen holds the lines it was written against no more.
export function lineAnnotations(
	file: ReviewFile,
	threads: DiffThread[],
	places: ReadonlyMap<string, ThreadPlacement>,
	composer: DiffAnchor | null,
	drawn: (side: "old" | "new", line: number) => boolean,
): DiffLineAnnotation[] {
	const annotations: DiffLineAnnotation[] = threads
		.filter((thread) => thread.path === file.name)
		.map((thread) => {
			const place = places.get(thread.id) ?? { kind: "outdated" as const };
			if (place.kind === "outdated") return { side: "additions" as const, lineNumber: 0, metadata: thread.id };
			return {
				side: place.side === "old" ? ("deletions" as const) : ("additions" as const),
				lineNumber: drawn(place.side, place.line) ? place.line : 0,
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
