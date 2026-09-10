import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

type Reached = { value: boolean; listeners: Set<() => void> };

const states = new WeakMap<QueryClient, Reached>();

// Whether one query client has taken a successful response from the server
// since it was made. A restored snapshot arrives through hydration, and a
// `setQueryData` write is a manual success, so neither counts. The first
// fetch that succeeds flips the value, and it never flips back.
const stateOf = (queryClient: QueryClient): Reached => {
	const existing = states.get(queryClient);
	if (existing !== undefined) return existing;
	const state: Reached = { value: false, listeners: new Set() };
	states.set(queryClient, state);
	queryClient.getQueryCache().subscribe((event) => {
		if (state.value) return;
		if (event.type !== "updated" || event.action.type !== "success" || event.action.manual === true) return;
		state.value = true;
		for (const listener of state.listeners) listener();
	});
	return state;
};

export const useServerReached = (): boolean => {
	const queryClient = useQueryClient();
	return useSyncExternalStore(
		(onChange) => {
			const state = stateOf(queryClient);
			state.listeners.add(onChange);
			return () => {
				state.listeners.delete(onChange);
			};
		},
		() => stateOf(queryClient).value,
	);
};
