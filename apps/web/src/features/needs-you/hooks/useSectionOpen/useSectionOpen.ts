import { useSyncExternalStore } from "react";

// Which Needs you sections are open, by section key. The choice outlives a
// page visit, so it lives in localStorage.
const storageKey = "needs-you-open";

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

// The raw string is the snapshot, so two renders with no change compare equal.
const read = () => localStorage.getItem(storageKey);

const parse = (raw: string | null): Record<string, boolean> => (raw === null ? {} : JSON.parse(raw));

// `initial` is the state of a section nobody has toggled yet.
export const useSectionOpen = (section: string, initial: boolean) => {
	const raw = useSyncExternalStore(subscribe, read);
	const stored = parse(raw);
	const open = stored[section] ?? initial;
	const toggle = () => {
		localStorage.setItem(storageKey, JSON.stringify({ ...stored, [section]: !open }));
		for (const listener of listeners) listener();
	};
	return { open, toggle };
};
