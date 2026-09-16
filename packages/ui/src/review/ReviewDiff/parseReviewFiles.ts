import { type FileDiffMetadata, parsePatchFiles } from "@pierre/diffs";

export function parseReviewFiles(patch: string): FileDiffMetadata[] {
	return parsePatchFiles(patch)
		.flatMap((parsedPatch) => parsedPatch.files)
		.map((file) => ({ ...file, lang: "text" }));
}
