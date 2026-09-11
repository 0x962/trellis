// An in-memory stand-in for expo-sqlite/kv-store. Every instance reads and
// writes one shared map, whatever database name it was built with. A test
// seeds a key through any instance, and the module under test reads it
// through its own. The class carries the synchronous methods the app calls;
// a test that needs another one adds it here.
const values = new Map<string, string>();

export class SQLiteStorage {
	readonly databaseName: string;

	constructor(databaseName: string) {
		this.databaseName = databaseName;
	}

	getItemSync(key: string): string | null {
		const value = values.get(key);
		return value === undefined ? null : value;
	}

	setItemSync(key: string, value: string): void {
		values.set(key, value);
	}

	removeItemSync(key: string): boolean {
		return values.delete(key);
	}

	getAllKeysSync(): string[] {
		return [...values.keys()];
	}

	clearSync(): boolean {
		values.clear();
		return true;
	}
}

export const Storage = new SQLiteStorage("kv-store");

export const AsyncStorage = Storage;

export default Storage;
