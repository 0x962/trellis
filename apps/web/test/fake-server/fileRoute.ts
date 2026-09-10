import type { State } from "./state";

const inlineMimes = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/avif",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"video/mp4",
	"video/webm",
]);

// The bytes of one attachment at `GET /api/attachments/{id}/file`. The
// response states the recorded mime, an ETag of the content hash, and the
// headers that stop the browser from running the file on the app origin.
// Only the allowlisted types render inline; everything else downloads.
export const serveAttachmentFile = (state: State, id: string): Response => {
	const attachment = state.attachments.get(id);
	if (attachment === undefined) return new Response(null, { status: 404 });
	const inline = inlineMimes.has(attachment.mime);
	return new Response(state.blobs.get(attachment.sha256)!, {
		headers: {
			"Cache-Control": "private, max-age=31536000, immutable",
			"Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${attachment.filename}"`,
			"Content-Security-Policy": "sandbox",
			"Content-Type": attachment.mime,
			ETag: `"${attachment.sha256}"`,
			"X-Content-Type-Options": "nosniff",
		},
	});
};
