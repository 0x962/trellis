import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../../../../lib/appContext";

// Why the server did not store one file. `maxBytes` is the size cap the
// server reported. `UPLOAD_FAILED` covers a network failure and a server
// fault, and it is the only error that a retry can clear.
export type UploadError =
	| { code: "PAYLOAD_TOO_LARGE"; maxBytes: number }
	| { code: "PROJECT_ARCHIVED" }
	| { code: "UPLOAD_FAILED" };

// One file of an attachment list. A `pending` file waits for a ticket
// identifier or for a retry. The browser reports no byte count while a
// request runs, so `percent` is 0 until the request succeeds and 100 after.
export type Upload = {
	id: string;
	file: File;
	percent: number;
	status: "pending" | "uploading" | "complete";
	error: UploadError | null;
};

export type Uploads = {
	uploads: Upload[];
	// With no ticket identifier, `useUploads` keeps each added file pending
	// until `uploadPending` receives one.
	addFiles: (files: File[]) => void;
	// Sends every pending file to `ticket`. It returns true when the server
	// holds every file of the list, including a file that another caller
	// added while the requests ran.
	uploadPending: (ticket: string) => Promise<boolean>;
	retry: (id: string, ticket: string) => Promise<boolean>;
	// Takes one entry off the list.
	dismiss: (id: string) => void;
	// Stops every running request and empties the list.
	clear: () => void;
};

// Each settled upload invalidates the attachment list of its target ticket.
// The grid then renders the server row instead of a local copy.
export const useUploads = (ticket?: string, removeCompleted = true): Uploads => {
	const { client, orpc, queryClient, scheduler } = useApp();
	const [uploads, setUploads] = useState<Upload[]>([]);
	const uploadsRef = useRef<Upload[]>([]);
	// One AbortController for each request that is still open, keyed by the
	// upload id. `clear` aborts each one, so a discarded composer attaches
	// no file to the ticket it already created.
	const running = useRef(new Map<string, AbortController>());

	const update = useCallback((change: (current: Upload[]) => Upload[]) => {
		const next = change(uploadsRef.current);
		uploadsRef.current = next;
		setUploads(next);
	}, []);

	// Sets the status of every listed file in one state write, so a
	// selection of many files redraws the list once and not once per file.
	const markUploading = useCallback(
		(ids: string[]) => {
			const marked = new Set(ids);
			update((current) =>
				current.map((item) =>
					marked.has(item.id) ? { ...item, status: "uploading" as const, percent: 0, error: null } : item,
				),
			);
		},
		[update],
	);

	// `send` expects the entry to carry the `uploading` status already.
	const send = useCallback(
		async (entry: Upload, target: string): Promise<boolean> => {
			const controller = new AbortController();
			running.current.set(entry.id, controller);
			const { error } = await safe(
				client.attachments.upload({ ticket: target, file: entry.file }, { signal: controller.signal }),
			);
			running.current.delete(entry.id);
			// An aborted request belongs to an entry that `clear` removed.
			if (controller.signal.aborted) return false;
			if (error !== null) {
				// Each branch names the server error code it handles. An error code
				// that no branch names reads as a plain upload failure, so a code
				// added to the contract later cannot wear another code's message.
				const uploadError: UploadError = !isDefinedError(error)
					? { code: "UPLOAD_FAILED" }
					: error.code === "PAYLOAD_TOO_LARGE"
						? { code: "PAYLOAD_TOO_LARGE", maxBytes: error.data.maxBytes }
						: error.code === "PROJECT_ARCHIVED"
							? { code: "PROJECT_ARCHIVED" }
							: { code: "UPLOAD_FAILED" };
				update((current) =>
					current.map((item) => (item.id === entry.id ? { ...item, status: "pending", error: uploadError } : item)),
				);
				return false;
			}
			update((current) =>
				current.map((item) =>
					item.id === entry.id ? { ...item, status: "complete", percent: 100, error: null } : item,
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

	const addFiles = useCallback(
		(files: File[]) => {
			const entries: Upload[] = files.map((file) => ({
				id: crypto.randomUUID(),
				file,
				percent: 0,
				status: ticket === undefined ? "pending" : "uploading",
				error: null,
			}));
			update((current) => [...current, ...entries]);
			if (ticket !== undefined) for (const entry of entries) void send(entry, ticket);
		},
		[send, ticket, update],
	);

	const uploadPending = useCallback(
		async (target: string) => {
			const pending = uploadsRef.current.filter((entry) => entry.status === "pending");
			markUploading(pending.map((entry) => entry.id));
			await Promise.all(pending.map((entry) => send(entry, target)));
			return uploadsRef.current.every((entry) => entry.status === "complete");
		},
		[markUploading, send],
	);

	const retry = useCallback(
		async (id: string, target: string) => {
			const entry = uploadsRef.current.find((item) => item.id === id)!;
			// A second click on Retry arrives before React hides the button.
			// Without this check the server stores the same file twice.
			if (entry.status === "uploading") return false;
			markUploading([id]);
			return send(entry, target);
		},
		[markUploading, send],
	);

	const clear = useCallback(() => {
		for (const controller of running.current.values()) controller.abort();
		running.current.clear();
		update(() => []);
	}, [update]);

	return {
		uploads,
		addFiles,
		uploadPending,
		retry,
		dismiss: (id) => update((current) => current.filter((entry) => entry.id !== id)),
		clear,
	};
};
