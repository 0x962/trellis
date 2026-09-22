import { usageError } from "../../errors.ts";

export type SummaryImage = { alt: string; path: string };

const imagePattern = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;

// A web address and a file that this server already stores stay as the
// agent wrote them. Every other target is a file on this machine.
const isLocal = (target: string): boolean => !/^(?:https?:|\/api\/)/i.test(target);

// The Markdown images of a summary whose files `trellis summary write` must
// upload, one per path. The alt text becomes the reason of the picture
// record, so an image without alt text ends the run before any upload.
export const localImages = (markdown: string): SummaryImage[] => {
	const images = new Map<string, SummaryImage>();
	for (const [, alt, path] of markdown.matchAll(imagePattern)) {
		if (!isLocal(path!) || images.has(path!)) continue;
		if (alt!.trim() === "") throw usageError(`image ${path} has no alt text; write what it shows: ![...](${path})`);
		images.set(path!, { alt: alt!.trim(), path: path! });
	}
	return [...images.values()];
};

// Points each local image at the URL of its uploaded file.
export const withImageUrls = (markdown: string, urls: ReadonlyMap<string, string>): string =>
	markdown.replace(imagePattern, (match, alt: string, path: string) => {
		const url = urls.get(path);
		return url === undefined ? match : `![${alt}](${url})`;
	});
