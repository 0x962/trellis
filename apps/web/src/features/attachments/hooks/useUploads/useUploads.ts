import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useState } from "react";
import { useApp } from "../../../../lib/appContext";

// The server refused an upload. `maxBytes` is the cap it reported.
export type UploadError = { code: "PAYLOAD_TOO_LARGE"; maxBytes: number };

// One file on its way to the server. `sent` counts the bytes the browser
// has written and `percent` is what the bar shows.
export type Upload = {
	id: string;
	name: string;
	size: number;
	sent: number;
	percent: number;
	error: UploadError | null;
};

export type Uploads = {
	uploads: Upload[];
	// Starts one upload per file and keeps one progress entry for each.
	start: (files: File[]) => void;
	// Takes one failed entry off the list.
	dismiss: (id: string) => void;
};

// Every upload of one ticket. An upload that settles invalidates the
// attachments list of that ticket, so the grid renders the server's rows
// and never a second copy of its own.
export const useUploads = (ticket: string, removeCompleted = true): Uploads => {
	const { client, orpc, queryClient, scheduler } = useApp();
	const [uploads, setUploads] = useState<Upload[]>([]);

	const start = useCallback(
		(files: File[]) => {
			const entries = files.map((file) => ({
				id: crypto.randomUUID(),
				name: file.name,
				size: file.size,
				sent: 0,
				percent: 0,
				error: null,
			}));
			setUploads((current) => [...current, ...entries]);
			for (const [index, file] of files.entries()) {
				const entry = entries[index]!;
				void (async () => {
					const { error } = await safe(client.attachments.upload({ ticket, file }));
					if (error !== null) {
						if (!isDefinedError(error) || error.code !== "PAYLOAD_TOO_LARGE") throw error;
						setUploads((current) =>
							current.map((upload) =>
								upload.id === entry.id
									? { ...upload, error: { code: "PAYLOAD_TOO_LARGE", maxBytes: error.data.maxBytes } }
									: upload,
							),
						);
						return;
					}
					setUploads((current) =>
						current.map((upload) => (upload.id === entry.id ? { ...upload, sent: upload.size, percent: 100 } : upload)),
					);
					await queryClient.invalidateQueries({
						queryKey: orpc.attachments.list.queryKey({ input: { ticket } }),
						refetchType: "all",
					});
					if (removeCompleted) {
						scheduler.setTimeout(() => setUploads((current) => current.filter((upload) => upload.id !== entry.id)), 0);
					}
				})();
			}
		},
		[client, orpc, queryClient, removeCompleted, scheduler, ticket],
	);

	return {
		uploads,
		start,
		dismiss: (id) => setUploads((current) => current.filter((upload) => upload.id !== id)),
	};
};
