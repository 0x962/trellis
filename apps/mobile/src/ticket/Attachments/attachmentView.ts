import type { Attachment } from "@trellis/api";

// An image at or over this size opens externally, like every other file.
export const inlineImageBytes = 3 * 1024 * 1024;

export type AttachmentView = "inline" | "external";

export const attachmentView = (attachment: Attachment): AttachmentView =>
	attachment.mime.startsWith("image/") && attachment.size < inlineImageBytes ? "inline" : "external";

// The absolute URL of the bytes: the stored server URL and the attachment's own path.
export const attachmentUrl = (serverUrl: string, attachment: Attachment): string => `${serverUrl}${attachment.url}`;
