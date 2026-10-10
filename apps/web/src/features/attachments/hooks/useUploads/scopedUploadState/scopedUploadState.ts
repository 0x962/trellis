import type { Upload } from "../useUploads";

type MissingFile = { id: string; name: string; size: number; lastModified: number };
type Snapshot = { uploads: Upload[]; missing: MissingFile[] };

export function createUploadState(scope?: string) {
	const key = scope === undefined ? undefined : `${scope}:uploads`;
	const saved = key === undefined ? null : sessionStorage.getItem(key);
	let snapshot: Snapshot = { uploads: [], missing: saved === null ? [] : JSON.parse(saved) };
	const listeners = new Set<() => void>();
	const state = {
		running: new Map<string, AbortController>(),
		generation: 0,
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		update: (change: (current: Snapshot) => Snapshot) => {
			snapshot = change(snapshot);
			if (key !== undefined) {
				const required = [
					...snapshot.missing,
					...snapshot.uploads
						.filter((entry) => entry.status !== "complete")
						.map(({ id, file }) => ({
							id,
							name: file.name,
							size: file.size,
							lastModified: file.lastModified,
						})),
				];
				if (required.length === 0) sessionStorage.removeItem(key);
				else sessionStorage.setItem(key, JSON.stringify(required));
			}
			for (const listener of listeners) listener();
		},
	};
	return state;
}

const scopes = new Map<string, ReturnType<typeof createUploadState>>();
export function scopedUploadState(scope: string) {
	let state = scopes.get(scope);
	if (state === undefined) {
		state = createUploadState(scope);
		scopes.set(scope, state);
	}
	return state;
}
