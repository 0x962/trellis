import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../../../../lib/appContext";

// A failed upload. `maxBytes` is the file-size cap from the server.
export type UploadError = { code: "PAYLOAD_TOO_LARGE"; maxBytes: number } | { code: "UPLOAD_FAILED" };

// One file on its way to the server. `sent` counts the bytes the browser
// has written and `percent` is what the bar shows.
export type Upload = {
	id: string;
	file: File;
	name: string;
	size: number;
	sent: number;
	percent: number;
	status: "pending" | "uploading" | "complete";
	error: UploadError | null;
};

export type Uploads = {
	uploads: Upload[];
	// A hook without a ticket keeps each file pending until `uploadPending`
	// receives the identifier of a created ticket.
	start: (files: File[]) => void;
	uploadPending: (ticket: string) => Promise<boolean>;
	retry: (id: string, ticket: string) => Promise<boolean>;
	// Takes one failed entry off the list.
	dismiss: (id: string) => void;
	clear: () => void;
};

// Each settled upload invalidates the attachment list of its target ticket.
// The grid then renders the server row instead of a local copy.
export const useUploads = (ticket?: string, removeCompleted = true): Uploads => {
	const { client, orpc, queryClient, scheduler } = useApp();
	const [uploads, setUploads] = useState<Upload[]>([]);
	const uploadsRef = useRef<Upload[]>([]);

	const update = useCallback((change: (current: Upload[]) => Upload[]) => {
		const next = change(uploadsRef.current);
		uploadsRef.current = next;
		setUploads(next);
	}, []);

	const upload = useCallback(
		async (entry: Upload, target: string): Promise<boolean> => {
			update((current) =>
				current.map((item) =>
					item.id === entry.id ? { ...item, status: "uploading", sent: 0, percent: 0, error: null } : item,
				),
			);
			const { error } = await safe(client.attachments.upload({ ticket: target, file: entry.file }));
			if (error !== null) {
				const uploadError: UploadError =
					isDefinedError(error) && error.code === "PAYLOAD_TOO_LARGE"
						? { code: "PAYLOAD_TOO_LARGE", maxBytes: error.data.maxBytes }
						: { code: "UPLOAD_FAILED" };
				update((current) =>
					current.map((item) => (item.id === entry.id ? { ...item, status: "pending", error: uploadError } : item)),
				);
				return false;
			}
			update((current) =>
				current.map((item) =>
					item.id === entry.id ? { ...item, status: "complete", sent: item.size, percent: 100, error: null } : item,
				),
			);
			await queryClient.invalidateQueries({
				queryKey: orpc.attachments.list.queryKey({ input: { ticket: target } }),
				refetchType: "all",
			});
			if (removeCompleted) {
				scheduler.setTimeout(() => update((current) => current.filter((item) => item.id !== entry.id)), 0);
			}
			return true;
		},
		[client, orpc, queryClient, removeCompleted, scheduler, update],
	);

	const start = useCallback(
		(files: File[]) => {
			const entries = files.map((file) => ({
				id: crypto.randomUUID(),
				file,
				name: file.name,
				size: file.size,
				sent: 0,
				percent: 0,
				status: ticket === undefined ? ("pending" as const) : ("uploading" as const),
				error: null,
			}));
			update((current) => [...current, ...entries]);
			if (ticket !== undefined) for (const entry of entries) void upload(entry, ticket);
		},
		[ticket, update, upload],
	);

	const uploadPending = useCallback(
		async (target: string) => {
			const pending = uploadsRef.current.filter((entry) => entry.status === "pending");
			const results = await Promise.all(pending.map((entry) => upload(entry, target)));
			return results.every(Boolean);
		},
		[upload],
	);

	const retry = useCallback(
		(id: string, target: string) => upload(uploadsRef.current.find((entry) => entry.id === id)!, target),
		[upload],
	);

	return {
		uploads,
		start,
		uploadPending,
		retry,
		dismiss: (id) => update((current) => current.filter((entry) => entry.id !== id)),
		clear: () => update(() => []),
	};
};
