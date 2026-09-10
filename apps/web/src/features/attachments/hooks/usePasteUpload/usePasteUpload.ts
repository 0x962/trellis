import type { ClipboardEvent } from "react";
import type { UploadError } from "../useUploads";

export type PasteUpload = {
	// The paste handler of a description editor or a comment composer.
	onPaste: (event: ClipboardEvent<HTMLElement>) => void;
	// True while a pasted image uploads.
	pending: boolean;
	error: UploadError | null;
};

// Uploads an image pasted into `ticket` and hands `onInsert` the markdown
// for the caret position. A paste that carries no image reaches the editor
// unchanged.
export const usePasteUpload = (_ticket: string, _onInsert: (markdown: string) => void): PasteUpload => {
	throw new Error("usePasteUpload is not implemented.");
};
