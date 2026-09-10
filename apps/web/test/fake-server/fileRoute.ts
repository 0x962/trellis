import type { State } from "./state";

// The bytes of one attachment at `GET /api/attachments/{id}/file`. The
// response states the recorded mime, an ETag of the content hash, and the
// headers that stop the browser from running the file on the app origin.
// Only the allowlisted types render inline; everything else downloads.
export const serveAttachmentFile = (_state: State, _id: string): Response => {
	throw new Error("The fake server does not serve attachment bytes.");
};
