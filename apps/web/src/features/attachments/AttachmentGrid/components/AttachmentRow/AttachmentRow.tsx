import type { Attachment } from "@trellis/api";

export type AttachmentRowProps = {
	attachment: Attachment;
};

// One file that is not an image: the type icon, the name, the size, the
// actor, the time, a download link, and the row menu.
export function AttachmentRow(_props: AttachmentRowProps) {
	return null;
}
