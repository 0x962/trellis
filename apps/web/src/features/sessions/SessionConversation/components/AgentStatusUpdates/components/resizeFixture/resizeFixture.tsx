import { expect } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { AgentRun, SessionUpdates, SessionUpdatesGetInput, TrellisClient } from "@trellis/api";
import { act, type Dispatch, type SetStateAction, useState } from "react";
import { createRoot } from "react-dom/client";
import { type AppContext, AppProvider } from "../../../../../../../lib/appContext";
import { AgentStatusUpdates } from "../../AgentStatusUpdates";
import { agentStatusUpdatesQueryOptions } from "../../agentStatusUpdatesState";
import type { createResizeBrowser } from "../resizeBrowser";
import { useStatusPaneWidth } from "../useStatusPaneWidth";

type View = { runId: string; enabled: boolean; observerError: string | null };
type Reply = ReturnType<typeof Promise.withResolvers<SessionUpdates>>;

export async function resizeFixture(browser: ReturnType<typeof createResizeBrowser>, width: number | null = null) {
	useStatusPaneWidth.setState({ width });
	browser.setNarrow(false);
	let parentWidth = 1_000;
	let change!: Dispatch<SetStateAction<View>>;
	const replies = new Map<string, Reply>();
	const reply = (id: string) => {
		if (!replies.has(id)) replies.set(id, Promise.withResolvers<SessionUpdates>());
		return replies.get(id)!;
	};
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY } },
	});
	const client = {
		sessionUpdates: { get: ({ sessionId }: SessionUpdatesGetInput) => reply(sessionId).promise },
	} as unknown as TrellisClient;
	const orpc = createTanstackQueryUtils(client);
	const app = {
		queryClient,
		client,
		orpc,
		scheduler: { now: () => Date.parse("2026-09-29T06:00:00Z"), setTimeout: () => 0, clearTimeout: () => {} },
	} as unknown as AppContext;
	const Route = () => {
		const [view, setView] = useState<View>({ runId: "session-a", enabled: true, observerError: null });
		change = setView;
		const run = {
			id: view.runId,
			runtime: "native",
			state: "stopped",
			processStatus: "exited",
			ticketStatusCategory: "done",
			observation: null,
		} as AgentRun;
		return (
			<>
				<div data-transcript>
					Transcript
					<input aria-label="Session message" defaultValue="Unsent message" />
				</div>
				{view.enabled && <AgentStatusUpdates run={run} observerError={view.observerError} />}
			</>
		);
	};
	const router = createRouter({ routeTree: createRootRoute({ component: Route }), history: createMemoryHistory() });
	await router.load();
	const container = document.createElement("div");
	Object.defineProperty(container, "clientWidth", { get: () => parentWidth });
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<RouterProvider router={router} />
				</AppProvider>
			</QueryClientProvider>,
		);
	});
	const settle = async (condition: () => boolean) => {
		for (let count = 0; count < 50; count++) {
			await act(async () => await new Promise((resolve) => setTimeout(resolve, 2)));
			if (condition()) return;
		}
		expect(condition()).toBe(true);
	};
	const handle = () => container.querySelector<HTMLElement>('[role="separator"][aria-label="Updates width"]')!;
	const pane = () => container.querySelector<HTMLElement>('aside[aria-label="Session status"]')!;
	const state = (id: string) => queryClient.getQueryState(agentStatusUpdatesQueryOptions(orpc, { id }).queryKey);
	return {
		container,
		handle,
		pane,
		width: () => Number(handle().getAttribute("aria-valuenow")),
		saved: () => useStatusPaneWidth.getState().width,
		stored: () => localStorage.getItem("trellis-session-updates-width")!,
		view: (value: Partial<View>) => act(async () => change((current) => ({ ...current, ...value }))),
		answer: async (id: string, value: SessionUpdates) => {
			await act(async () => reply(id).resolve(value));
			await settle(() => state(id)?.status === "success");
		},
		fail: async (id: string) => {
			await act(async () => reply(id).reject(new Error("Status is unavailable")));
			await settle(() => state(id)?.status === "error");
		},
		resize: (value: number) =>
			act(async () => {
				parentWidth = value;
				browser.resize(container);
			}),
		narrow: (value: boolean) => act(async () => browser.setNarrow(value)),
		pointer: (type: string, x: number, pointerId = 1, target = handle()) =>
			act(async () => browser.pointer(target, type, x, pointerId)),
		key: (key: string, shiftKey = false) =>
			act(async () => {
				handle().dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
			}),
		rehydrate: (stored: string) =>
			act(async () => {
				useStatusPaneWidth.setState({ width: null });
				localStorage.setItem("trellis-session-updates-width", stored);
				await useStatusPaneWidth.persist.rehydrate();
			}),
		close: async () => {
			await act(async () => root.unmount());
			queryClient.clear();
			container.remove();
		},
	};
}
