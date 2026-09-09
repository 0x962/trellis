import { mock } from "bun:test";
import { act } from "@testing-library/react";

type Listener = (event: { matches: boolean }) => void;

// Replaces `window.matchMedia` with a list whose `matches` the test controls.
// `fire` flips the value and notifies every listener the hook registered, so a
// test can observe the hook's reaction and count the listeners left behind.
export const mockMatchMedia = (matches: boolean) => {
	const listeners = new Set<Listener>();
	const list = {
		matches,
		media: "",
		addEventListener: (_type: string, listener: Listener) => {
			listeners.add(listener);
		},
		removeEventListener: (_type: string, listener: Listener) => {
			listeners.delete(listener);
		},
	};
	const matchMedia = mock((query: string) => {
		list.media = query;
		return list;
	});
	window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
	return {
		matchMedia,
		listeners,
		fire: (next: boolean) => {
			list.matches = next;
			act(() => {
				for (const listener of listeners) listener({ matches: next });
			});
		},
	};
};
