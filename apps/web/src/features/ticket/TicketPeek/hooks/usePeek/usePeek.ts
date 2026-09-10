import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useApp } from "../../../../../lib/appContext";

type Search = Record<string, unknown>;

// The element that opened the peek. Focus returns to it on close. One
// peek is open at a time, so one slot serves every caller.
let opener: HTMLElement | null = null;

// The peek is the `peek` search param of the list route. `open` pushes it,
// so browser back closes the peek. `step` and `close` replace the entry,
// so a j/k walk and an Escape leave no trail in the history.
export const usePeek = () => {
	const navigate = useNavigate();
	const { orpc, queryClient } = useApp();
	const current = useRouterState({ select: (state) => (state.location.search as { peek?: string }).peek });
	const load = useCallback(
		(identifier: string) =>
			queryClient.ensureQueryData(orpc.tickets.get.queryOptions({ input: { ticket: identifier } })),
		[orpc, queryClient],
	);

	const open = useCallback(
		async (identifier: string, from?: HTMLElement) => {
			if (from !== undefined) opener = from;
			await load(identifier);
			await navigate({ to: ".", search: (prev: Search) => ({ ...prev, peek: identifier }) });
		},
		[load, navigate],
	);

	const step = useCallback(
		async (identifier: string) => {
			await load(identifier);
			await navigate({ to: ".", search: (prev: Search) => ({ ...prev, peek: identifier }), replace: true });
		},
		[load, navigate],
	);

	const close = useCallback(() => {
		void navigate({ to: ".", search: ({ peek, ...prev }: Search) => prev, replace: true });
		const target = opener;
		opener = null;
		target?.focus();
	}, [navigate]);

	return useMemo(() => ({ current, open, step, close }), [current, open, step, close]);
};
