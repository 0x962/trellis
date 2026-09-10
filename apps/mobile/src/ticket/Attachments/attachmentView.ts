import type { Attachment } from "@trellis/api";

// An image at or over this size opens externally, like every other file.
export const inlineImageBytes = 3 * 1024 * 1024;

export type AttachmentView = "inline" | "external";

export const attachmentView = (_attachment: Attachment): AttachmentView => {
	throw new Error("attachmentView is not implemented");
};

// The absolute URL of the bytes: the stored server URL and the attachment's own path.
export const attachmentUrl = (_serverUrl: string, _attachment: Attachment): string => {
	throw new Error("attachmentUrl is not implemented");
};
