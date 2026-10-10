import { afterAll, afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import type { TicketClassification, TicketClassificationInput } from "@trellis/api";
import { Window } from "happy-dom";
import { act } from "react";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import type { AssignChoice } from "../../../../agents/AssignAgent/assignChoice";
import { useRecentChoices } from "../../../../agents/AssignAgent/recentChoices";
import { routeDefaults } from "../../../../command/utils/routeDefaults";
import { NewTicketButton } from "../../../../shell/NewTicketButton";
import { type ComposerOptions, composerActions, useComposerStore } from "../../../composerStore";
import { draftKey } from "../../../hooks/useComposerDraft/useComposerDraft";
import { useTicketComposer } from "./useTicketComposer";

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
const storage = new Map<string, string>();
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
const wait = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 650));
	});
const remembered: AssignChoice = {
	preset: "codex",
	model: "openai/gpt-6-astra",
	effort: "high",
	accountId: "saved-account",
};

async function fixture(fixed = false, options: ComposerOptions = {}, pathname = "/") {
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
				start: async () => {
					throw new Error("Unexpected agent start");
				},
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
		composer = useTicketComposer();
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

test("the composer keeps the last preference through classification, reopen, and Create another", async () => {
	const f = await fixture();
	expect(f.current().choice).toEqual(remembered);
	await act(async () => f.current().setDraft({ title: "Fix a label", description: "" }));
	await wait();
	expect(f.requests[0]!.input).not.toHaveProperty("harness");
	await act(async () => f.requests[0]!.resolve({ epic: null, wave: null, priority: "low" }));
	expect(f.current().choice).toEqual(remembered);
	await f.reopen();
	expect(f.current().choice).toEqual(remembered);
	const chosen: AssignChoice = { ...remembered, model: "openai/gpt-5.6-luna", effort: "medium" };
	await act(async () => f.current().chooseClassification({ assignment: chosen }));
	await act(async () => f.current().finish(true));
	expect(f.current().draft.title).toBe("");
	expect(f.current().choice).toEqual(chosen);
	await f.reopen();
	expect(f.current().choice).toEqual(chosen);
});

test("fixed ticket fields need no Jev call to keep the last preference", async () => {
	const f = await fixture(true);
	await act(async () => f.current().setDraft({ title: "Fix a label", description: "" }));
	await wait();
	expect(f.requests).toHaveLength(0);
	expect(f.current().choice).toEqual(remembered);
});

test.each(["button", "keyboard"])("the %s keeps the page epic over a saved automatic placement", async (entry) => {
	storage.set(
		draftKey,
		JSON.stringify({
			title: "Fix a label",
			description: "",
			project: "OLD",
			epic: "OLD/closed",
			wave: "OLD/closed/work",
			parent: "OLD-1",
			labels: [{ id: "old-label" }],
			automatic: ["epic", "wave"],
		}),
	);
	const f = await fixture(false, {}, "/p/TRL/epics/current");
	if (entry === "button") await f.clickNew();
	else await f.open(routeDefaults("/p/TRL/epics/current", {}));
	expect(f.current().draft).toMatchObject({
		project: "TRL",
		epic: "TRL/current",
		wave: undefined,
		parent: null,
		labels: [],
	});
	await wait();
	expect(f.requests.at(-1)!.input).toMatchObject({ project: "TRL", epic: "TRL/current" });
	await act(async () => f.requests.at(-1)!.resolve({ epic: "TRL/current", wave: null, priority: "high" }));
	expect(f.current().placement).toMatchObject({ epic: "TRL/current", newWave: true, ready: true });
});

test.each(["!high", "high,low"])("the button preserves default priority rules for %s", async (priority) => {
	const f = await fixture(false, {}, `/p/TRL/epics/current?priority=${priority}`);
	await f.clickNew();
	expect(useComposerStore.getState().options).toEqual({ project: "TRL", epic: "TRL/current" });
	expect(f.current().priority).toBe("none");
});

test("page context applies to an initial draft and explicit choices remain editable", async () => {
	storage.set(
		draftKey,
		JSON.stringify({ title: "Fix a label", description: "", epic: "TRL/other", wave: "TRL/other/work" }),
	);
	const f = await fixture(false, { epic: "TRL/current" });
	expect(f.current().draft.epic).toBe("TRL/current");
	await act(async () => f.current().chooseClassification({ epic: "TRL/manual", wave: "TRL/manual/work" }));
	await wait();
	expect(f.requests.at(-1)!.input).toMatchObject({ epic: "TRL/manual", wave: "TRL/manual/work" });
	expect(f.current().draft.epic).toBe("TRL/manual");
});

test("a delayed classification cannot replace the epic of a new open", async () => {
	const f = await fixture();
	await act(async () => f.current().setDraft({ title: "Fix a label", description: "" }));
	await wait();
	const old = f.requests[0]!;
	await act(async () => f.current().close());
	await f.open({ project: "TRL", epic: "TRL/current" });
	await act(async () => old.resolve({ epic: "TRL/closed", wave: "TRL/closed/work", priority: "high" }));
	expect(f.current().draft.epic).toBe("TRL/current");
	await wait();
	expect(f.requests.at(-1)!.input.epic).toBe("TRL/current");
});
