import { ORPCError } from "@orpc/client";
import type { UploadError } from "../hooks/useUploads";

export type PendingUpload = (input: { ticket: string; file: File }) => Promise<unknown>;

export type PendingUploadFailure = { name: string; error: UploadError };

// Uploads files the composer held in the browser to a ticket that did not
// exist when they were picked. Each refused file is reported by name, so the
// caller names it in a toast; any other error throws.
export const uploadPendingFiles = async (
	upload: PendingUpload,
	ticket: string,
	files: File[],
): Promise<PendingUploadFailure[]> => {
	const failed: PendingUploadFailure[] = [];
	for (const file of files) {
		try {
			await upload({ ticket, file });
		} catch (error) {
			if (!(error instanceof ORPCError) || error.code !== "PAYLOAD_TOO_LARGE") throw error;
			failed.push({ name: file.name, error: { code: "PAYLOAD_TOO_LARGE", maxBytes: error.data.maxBytes } });
		}
	}
	return failed;
};
