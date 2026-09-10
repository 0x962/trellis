import type { Attachment } from "@trellis/api";

// The markdown a description or a comment carries for `attachment`: the
// image form for an image, the link form for every other file.
export const attachmentMarkdown = (_attachment: Attachment): string => {
	throw new Error("attachmentMarkdown is not implemented.");
};
