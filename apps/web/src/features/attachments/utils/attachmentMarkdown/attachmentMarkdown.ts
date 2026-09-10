import type { Attachment } from "@trellis/api";
import { isThumbnailImage } from "../isThumbnailImage";

// The markdown a description or a comment carries for `attachment`: the
// image form for an image, the link form for every other file.
export const attachmentMarkdown = (attachment: Attachment): string =>
	isThumbnailImage(attachment.mime)
		? `![${attachment.filename}](${attachment.url})`
		: `[${attachment.filename}](${attachment.url})`;
