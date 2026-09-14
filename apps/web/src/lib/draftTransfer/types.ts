export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;
export type DraftStores = { local: DraftStore; session: DraftStore };
export interface DraftEntry {
	area: "local" | "session";
	key: string;
	value: string;
}
export interface RecoveryCopy {
	id: string;
	entry: DraftEntry;
	importedAt: string;
	order: number;
}
export interface DraftBundle {
	format: "trellis-drafts";
	version: 1;
	exportedAt: string;
	entries: DraftEntry[];
}
