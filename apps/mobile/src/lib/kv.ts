// The synchronous part of expo-sqlite/kv-store the app calls. Its
// `SQLiteStorage` satisfies this shape, so the store opens a SQLite file on a
// phone and a map in a test. The backend answers `null` for a key it holds
// nothing for.
export type KvBackend = {
	getItemSync: (key: string) => string | null;
	setItemSync: (key: string, value: string) => void;
	removeItemSync: (key: string) => boolean;
	getAllKeysSync: () => string[];
	clearSync: () => boolean;
};

// A change to one key. The store hands the listener the key that changed.
export type KvListener = (key: string) => void;

// One key-value store over a synchronous backend. A reader gets `undefined`
// for a key the store holds nothing for. Every write names the key it
// changed, so a mounted hook re-reads that key and no other.
export type KvStore = {
	getString: (key: string) => string | undefined;
	set: (key: string, value: string) => void;
	remove: (key: string) => void;
	contains: (key: string) => boolean;
	clearAll: () => void;
	addOnValueChangedListener: (onValueChanged: KvListener) => { remove: () => void };
};

export const createKvStore = (backend: KvBackend): KvStore => {
	const listeners = new Set<KvListener>();
	// The copy lets a listener drop itself inside its own call without
	// cutting the round short for the listeners after it.
	const notify = (key: string) => {
		for (const listener of [...listeners]) listener(key);
	};

	return {
		getString: (key) => backend.getItemSync(key) ?? undefined,
		set: (key, value) => {
			backend.setItemSync(key, value);
			notify(key);
		},
		remove: (key) => {
			backend.removeItemSync(key);
			notify(key);
		},
		contains: (key) => backend.getItemSync(key) !== null,
		clearAll: () => {
			const keys = backend.getAllKeysSync();
			backend.clearSync();
			for (const key of keys) notify(key);
		},
		addOnValueChangedListener: (onValueChanged) => {
			listeners.add(onValueChanged);
			return {
				remove: () => {
					listeners.delete(onValueChanged);
				},
			};
		},
	};
};
