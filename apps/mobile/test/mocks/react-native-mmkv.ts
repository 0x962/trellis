import { useEffect, useState } from "react";

// An in-memory stand-in for react-native-mmkv. Every instance reads and
// writes one shared map, whatever id it was created with. A test seeds a
// key through any instance, and the module under test reads it through its
// own. `clearAll` on any instance empties the map and notifies every listener.
type Value = string | number | boolean | ArrayBuffer;
type Listener = (key: string) => void;

const values = new Map<string, Value>();
const listeners = new Set<Listener>();

const notify = (key: string) => {
	for (const listener of listeners) listener(key);
};

export type MMKV = {
	set: (key: string, value: Value) => void;
	getString: (key: string) => string | undefined;
	getNumber: (key: string) => number | undefined;
	getBoolean: (key: string) => boolean | undefined;
	contains: (key: string) => boolean;
	remove: (key: string) => boolean;
	getAllKeys: () => string[];
	clearAll: () => void;
	addOnValueChangedListener: (onValueChanged: Listener) => { remove: () => void };
};

const instance: MMKV = {
	set: (key, value) => {
		values.set(key, value);
		notify(key);
	},
	getString: (key) => {
		const value = values.get(key);
		return typeof value === "string" ? value : undefined;
	},
	getNumber: (key) => {
		const value = values.get(key);
		return typeof value === "number" ? value : undefined;
	},
	getBoolean: (key) => {
		const value = values.get(key);
		return typeof value === "boolean" ? value : undefined;
	},
	contains: (key) => values.has(key),
	remove: (key) => {
		const had = values.delete(key);
		if (had) notify(key);
		return had;
	},
	getAllKeys: () => [...values.keys()],
	clearAll: () => {
		const keys = [...values.keys()];
		values.clear();
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

export const createMMKV = (_config?: { id?: string }): MMKV => instance;

export const useMMKV = (_config?: { id?: string }): MMKV => instance;

// The value of one key, re-read after every change to that key.
export const useMMKVString = (key: string, storage: MMKV = instance) => {
	const [value, setValue] = useState(() => storage.getString(key));
	useEffect(() => {
		setValue(storage.getString(key));
		const listener = storage.addOnValueChangedListener((changed) => {
			if (changed === key) setValue(storage.getString(key));
		});
		return () => listener.remove();
	}, [key, storage]);
	const set = (next: string | undefined) => {
		if (next === undefined) storage.remove(key);
		else storage.set(key, next);
	};
	return [value, set] as const;
};

export const useMMKVListener = (listener: Listener, storage: MMKV = instance) => {
	useEffect(() => storage.addOnValueChangedListener(listener).remove, [listener, storage]);
};
