import { draftKind, parseDraftBundle } from "./parseDraftBundle";
import type { DraftBundle, DraftEntry, DraftStore, DraftStores, RecoveryCopy } from "./types";

const recoveryPrefix = "trellis.draft-transfer.copy.";
const equal = (a: DraftEntry, b: DraftEntry) => a.area === b.area && a.key === b.key && a.value === b.value;
export function listRecoveryCopies(storage: DraftStore): RecoveryCopy[] {
	const copies: RecoveryCopy[] = [];
	for (let index = 0; index < storage.length; index++) {
		const key = storage.key(index);
		if (key === null || !key.startsWith(recoveryPrefix)) continue;
		const value = storage.getItem(key);
		if (value !== null) copies.push(JSON.parse(value));
	}
	return copies.sort(
		(a, b) => a.importedAt.localeCompare(b.importedAt) || a.order - b.order || a.id.localeCompare(b.id),
	);
}
export function preserveDraft(storage: DraftStore, entry: DraftEntry): RecoveryCopy {
	const copies = listRecoveryCopies(storage);
	const existing = copies.find((copy) => equal(copy.entry, entry));
	if (existing) return existing;
	const copy = { id: crypto.randomUUID(), entry, importedAt: new Date().toISOString(), order: copies.length };
	storage.setItem(`${recoveryPrefix}${copy.id}`, JSON.stringify(copy));
	return copy;
}
export function acknowledgeCopy(storage: DraftStore, id: string) {
	storage.removeItem(`${recoveryPrefix}${id}`);
}
export function exportDrafts(stores: DraftStores): string {
	const entries: DraftEntry[] = [];
	for (const area of ["local", "session"] as const) {
		const storage = stores[area];
		for (let index = 0; index < storage.length; index++) {
			const key = storage.key(index);
			if (key === null || draftKind({ area, key }) === null) continue;
			const value = storage.getItem(key);
			if (value !== null) entries.push({ area, key, value });
		}
	}
	for (const copy of listRecoveryCopies(stores.local))
		if (!entries.some((entry) => equal(entry, copy.entry))) entries.push(copy.entry);
	const bundle: DraftBundle = { format: "trellis-drafts", version: 1, exportedAt: new Date().toISOString(), entries };
	return JSON.stringify(bundle, null, 2);
}
export function importDrafts(stores: DraftStores, text: string): RecoveryCopy[] {
	const bundle = parseDraftBundle(text);
	const copies = listRecoveryCopies(stores.local);
	const imported: RecoveryCopy[] = [];
	for (const entry of bundle.entries) {
		const existing = copies.find((copy) => equal(copy.entry, entry));
		if (existing) {
			imported.push(existing);
			continue;
		}
		const copy = { id: crypto.randomUUID(), entry, importedAt: new Date().toISOString(), order: copies.length };
		stores.local.setItem(`${recoveryPrefix}${copy.id}`, JSON.stringify(copy));
		copies.push(copy);
		imported.push(copy);
	}
	return imported;
}
export function restoreDraft(stores: DraftStores, id: string) {
	const copy = listRecoveryCopies(stores.local).find((copy) => copy.id === id);
	if (!copy) throw new Error("This recovery copy was removed in another window.");
	const current = stores[copy.entry.area].getItem(copy.entry.key);
	if (current !== null && current !== copy.entry.value) preserveDraft(stores.local, { ...copy.entry, value: current });
	stores[copy.entry.area].setItem(copy.entry.key, copy.entry.value);
	return copy;
}
