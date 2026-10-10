import { afterAll, afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import type { TicketClassification, TicketClassificationInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import type { AssignChoice } from "../../../../agents/AssignAgent/assignChoice";
import { useRecentChoices } from "../../../../agents/AssignAgent/recentChoices";
import { composerActions } from "../../../composerStore";
import { useTicketComposer } from "./useTicketComposer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
afterAll(() => {
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

async function fixture(fixed = false) {
	useRecentChoices.setState({ recent: [remembered] });
	composerActions.open({ project: "TRL", ...(fixed ? { wave: "TRL/plan/work", priority: "high" as const } : {}) });
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
			epics: { list: query("epics", []), get: query("epic", { waves: [] }) },
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
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	let composer: ReturnType<typeof useTicketComposer>;
	function Probe() {
		composer = useTicketComposer();
		return null;
	}
	const root = createRoot();
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

test("a placement launch keeps draft text and applies its fields only once", async () => {
	const f = await fixture();
	await act(async () =>
		f.current().setDraft({
			title: "Keep this title",
			description: "Keep this description",
			project: "OLD",
			epic: "OLD/old",
			wave: "OLD/old/first",
			parent: "OLD-1",
			labels: [{ id: "old-label", name: "Old", group: null, color: "gray" }],
			automatic: ["epic", "wave", "priority"],
		}),
	);
	await act(async () =>
		composerActions.open({
			project: "TRL",
			epic: "TRL/plan",
			wave: "TRL/plan/work",
			applyPlacement: true,
		}),
	);
	expect(f.current().draft).toMatchObject({
		title: "Keep this title",
		description: "Keep this description",
		project: "TRL",
		epic: "TRL/plan",
		wave: "TRL/plan/work",
		parent: null,
		labels: [],
		automatic: ["priority"],
	});
	await act(async () => f.current().chooseClassification({ wave: "TRL/plan/next" }));
	expect(f.current().draft.wave).toBe("TRL/plan/next");
	await act(async () => f.current().finish(true));
	expect(f.current().draft.wave).toBe("TRL/plan/next");
});

test("ordinary composer launch retains its existing draft placement", async () => {
	const f = await fixture();
	await act(async () =>
		f.current().setDraft({ title: "Draft", description: "", project: "OLD", epic: "OLD/old", wave: "OLD/old/one" }),
	);
	await act(async () => composerActions.open({ project: "TRL", epic: "TRL/plan", wave: "TRL/plan/work" }));
	expect(f.current().draft).toMatchObject({ project: "OLD", epic: "OLD/old", wave: "OLD/old/one" });
});
