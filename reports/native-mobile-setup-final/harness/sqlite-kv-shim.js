export class SQLiteStorage {
	constructor(name) {
		this.prefix = name + ":";
	}

	getItemSync(key) {
		return localStorage.getItem(this.prefix + key);
	}

	setItemSync(key, value) {
		localStorage.setItem(this.prefix + key, value);
	}

	removeItemSync(key) {
		const fullKey = this.prefix + key;
		const found = localStorage.getItem(fullKey) !== null;
		localStorage.removeItem(fullKey);
		return found;
	}

	getAllKeysSync() {
		const keys = [];
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (key?.startsWith(this.prefix)) keys.push(key.slice(this.prefix.length));
		}
		return keys;
	}

	clearSync() {
		for (const key of this.getAllKeysSync()) localStorage.removeItem(this.prefix + key);
		return true;
	}
}
