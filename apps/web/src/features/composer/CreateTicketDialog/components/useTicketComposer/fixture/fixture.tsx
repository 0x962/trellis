import { afterAll, afterEach } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import type { AgentRun, TicketClassification, TicketClassificationInput } from "@trellis/api";
import { Window } from "happy-dom";
import { act } from "react";
import { type AppContext, AppProvider } from "../../../../../../lib/appContext";
import type { AssignChoice } from "../../../../../agents/AssignAgent/assignChoice";
import { useRecentChoices } from "../../../../../agents/AssignAgent/recentChoices";
import { NewTicketButton } from "../../../../../shell/NewTicketButton";
import type { ComposerInstance } from "../../../../composerScope";
import { type ComposerOptions, composerActions } from "../../../../composerStore";
import { useTicketComposer } from "../useTicketComposer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const browser = new Window({ url: "http://localhost:4173" });
const saved = new Map<string, PropertyDescriptor | undefined>();
for (const name of ["window", "document", "navigator", "Element", "HTMLElement", "Node"]) {
	saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: name === "window" ? browser : Reflect.get(browser, name),
	});
}
const { createRoot } = await import("react-dom/client");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
export const storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
	configurable: true,
	value: {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
		removeItem: (key: string) => storage.delete(key),
	},
});
afterAll(async () => {
	await browser.happyDOM.abort();
	for (const [name, descriptor] of saved) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
	else Reflect.deleteProperty(globalThis, "sessionStorage");
});
const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const dispose of disposals.splice(0)) await dispose();
	storage.clear();
	useRecentChoices.setState({ recent: [] });
	composerActions.close();
});
export const wait = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 650));
	});
export const remembered: AssignChoice = {
	preset: "codex",
	model: "openai/gpt-6-astra",
	effort: "high",
	accountId: "saved-account",
};

export async function fixture(
	fixed = false,
	options: ComposerOptions = {},
	pathname = "/",
	instance?: ComposerInstance,
	start?: () => Promise<AgentRun>,
) {
	useRecentChoices.setState({ recent: [remembered] });
	composerActions.open({
		project: "TRL",
		...(fixed ? { wave: "TRL/plan/work", priority: "high" as const } : {}),
		...options,
	});
	const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
	const query = (key: string, data: unknown) => {
		queryClient.setQueryData([key], data);
		return { queryOptions: () => ({ queryKey: [key], queryFn: async () => data }) };
	};
	const requests: Array<{ input: TicketClassificationInput; resolve: (result: TicketClassification) => void }> = [];
	const app = {
		queryClient,
		orpc: {
			agentRuns: { list: { key: () => ["agentRuns"] } },
			tickets: { key: () => ["tickets"] },
			projects: { get: query("project", { statuses: [], ticketTemplate: "" }) },
			epics: {
				list: query("epics", [{ id: "current", ref: "TRL/current", name: "Current", slug: "current" }]),
				get: query("epic", { waves: [] }),
			},
			harnessAccounts: { list: query("accounts", [{ id: "saved-account", harness: "codex" }]) },
			labels: { list: query("labels", { labels: [], groups: [] }) },
		},
		client: {
			agentRuns: {
				start:
					start ??
					(async () => {
						throw new Error("Unexpected agent start");
					}),
			},
			tickets: {
				classify: (input: TicketClassificationInput) =>
					new Promise<TicketClassification>((resolve) => requests.push({ input, resolve })),
			},
		},
	} as unknown as AppContext;
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: [pathname] }),
	});
	let composer: ReturnType<typeof useTicketComposer>;
	function Probe() {
		composer = useTicketComposer(instance);
		return <NewTicketButton />;
	}
	const container = document.createElement("div");
	const root = createRoot(container);
	const render = () =>
		act(async () => {
			root.render(
				<RouterContextProvider router={router}>
					<QueryClientProvider client={queryClient}>
						<AppProvider value={app}>
							<Probe />
						</AppProvider>
					</QueryClientProvider>
				</RouterContextProvider>,
			);
		});
	await render();
	disposals.push(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	});
	return {
		requests,
		current: () => composer!,
		open: async (options: ComposerOptions) => act(async () => composerActions.open(options)),
		clickNew: async () =>
			act(async () => {
				container.querySelector<HTMLButtonElement>("button[aria-label='New ticket']")!.click();
			}),
		reopen: async () => {
			await act(async () => {
				composer!.close();
				root.render(<div />);
			});
			composerActions.open({ project: "TRL" });
			await render();
		},
	};
}

export { act };
