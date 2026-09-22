import type { TrellisClient } from "@trellis/api/client";
import { ulid } from "ulid";
import { usageError } from "../errors.ts";
import { fileAt } from "../file.ts";

export type MarkdownImage = { alt: string; path: string };

const imagePattern = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;

// A web address and a file that this server already stores stay as the
// agent wrote them. Every other target is a file on this machine.
const isLocal = (target: string): boolean => !/^(?:https?:|\/api\/)/i.test(target);

// The Markdown images of a summary or an evidence document whose files the
// command must upload, one per path. The alt text tells the reader what the
// image shows, so an image without alt text ends the run before any upload.
export const localImages = (markdown: string): MarkdownImage[] => {
	const images = new Map<string, MarkdownImage>();
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

// Uploads each local image of the Markdown to the pull request, then points
// every reference to it at the stored file. Every file is read before the
// first upload, so a wrong path sends nothing.
export const uploadImages = async (client: TrellisClient, pullRequestId: string, markdown: string): Promise<string> => {
	const images = localImages(markdown).map((image) => ({ ...image, file: fileAt(image.path) }));
	const urls = new Map<string, string>();
	for (const image of images) {
		const stored = await client.pullRequests.uploadFile({ id: pullRequestId, fileId: ulid(), file: image.file });
		urls.set(image.path, stored.url);
	}
	return withImageUrls(markdown, urls);
};
