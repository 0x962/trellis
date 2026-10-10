import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { ulid } from "ulid";
import { useApp } from "../../../../lib/appContext";
import { createUploadState, scopedUploadState } from "./scopedUploadState";

// Why the server did not store one file. `UPLOAD_FAILED` covers a network
// failure and a server fault, and it is the only error that a retry can clear.
export type UploadError = { code: "PROJECT_ARCHIVED" } | { code: "UPLOAD_FAILED" };

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
	missingFiles: string[];
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
export const useUploads = (ticket?: string, removeCompleted = true, scope?: string): Uploads => {
	const { client, orpc, queryClient, scheduler } = useApp();
	const [state] = useState(() => (scope === undefined ? createUploadState() : scopedUploadState(scope)));
	const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);
	const update = useCallback(
		(change: (current: Upload[]) => Upload[]) => {
			state.update((current) => ({ ...current, uploads: change(current.uploads) }));
		},
		[state],
	);

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
			state.running.set(entry.id, controller);
			const { error } = await safe(
				client.attachments.upload({ id: entry.id, ticket: target, file: entry.file }, { signal: controller.signal }),
			);
			state.running.delete(entry.id);
			// An aborted request belongs to an entry that `clear` removed.
			if (controller.signal.aborted) return false;
			if (error !== null) {
				// Each branch names the server error code it handles. An error code
				// that no branch names reads as a plain upload failure, so a code
				// added to the contract later cannot wear another code's message.
				const uploadError: UploadError =
					isDefinedError(error) && error.code === "PROJECT_ARCHIVED"
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
		[client, orpc, queryClient, removeCompleted, scheduler, state, update],
	);

	const addFiles = useCallback(
		(files: File[]) => {
			const entries: Upload[] = [];
			state.update((current) => {
				const missing = [...current.missing];
				for (const file of files) {
					const index = missing.findIndex(
						(item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
					);
					const saved = index === -1 ? undefined : missing.splice(index, 1)[0];
					entries.push({
						id: saved?.id ?? ulid(),
						file,
						percent: 0,
						status: ticket === undefined ? "pending" : "uploading",
						error: null,
					});
				}
				return { uploads: [...current.uploads, ...entries], missing };
			});
			if (ticket !== undefined) for (const entry of entries) void send(entry, ticket);
		},
		[send, ticket, state],
	);

	const uploadPending = useCallback(
		async (target: string) => {
			if (state.getSnapshot().missing.length > 0) return false;
			const generation = state.generation;
			const pending = state.getSnapshot().uploads.filter((entry) => entry.status === "pending");
			markUploading(pending.map((entry) => entry.id));
			await Promise.all(pending.map((entry) => send(entry, target)));
			return (
				generation === state.generation &&
				state.getSnapshot().missing.length === 0 &&
				state.getSnapshot().uploads.every((entry) => entry.status === "complete")
			);
		},
		[markUploading, send, state],
	);

	const retry = useCallback(
		async (id: string, target: string) => {
			const entry = state.getSnapshot().uploads.find((item) => item.id === id)!;
			// A second click on Retry arrives before React hides the button.
			// Without this check the server stores the same file twice.
			if (entry.status === "uploading") return false;
			markUploading([id]);
			return send(entry, target);
		},
		[markUploading, send, state],
	);

	const clear = useCallback(() => {
		state.generation++;
		for (const controller of state.running.values()) controller.abort();
		state.running.clear();
		state.update(() => ({ uploads: [], missing: [] }));
	}, [state]);

	return {
		uploads: snapshot.uploads,
		missingFiles: snapshot.missing.map((file) => file.name),
		addFiles,
		uploadPending,
		retry,
		dismiss: (id) => update((current) => current.filter((entry) => entry.id !== id)),
		clear,
	};
};
