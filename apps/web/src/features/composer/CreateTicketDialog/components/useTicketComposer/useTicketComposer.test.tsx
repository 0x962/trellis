import { afterAll, afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import type { AgentRun, TicketClassification, TicketClassificationInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import type { AssignChoice } from "../../../../agents/AssignAgent/assignChoice";
import { useRecentChoices } from "../../../../agents/AssignAgent/recentChoices";
import type { ComposerInstance } from "../../../composerScope";
import { composerActions, useComposerStore } from "../../../composerStore";
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

async function fixture(fixed = false, instance?: ComposerInstance, start?: () => Promise<AgentRun>) {
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
			agentRuns: { list: { key: () => ["agentRuns"] } },
			tickets: { key: () => ["tickets"] },
			projects: { get: query("project", { statuses: [], ticketTemplate: "" }) },
			epics: { list: query("epics", []), get: query("epic", { waves: [] }) },
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
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	let composer: ReturnType<typeof useTicketComposer>;
	function Probe() {
		composer = useTicketComposer(instance);
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
		app,
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

test("an isolated composer keeps the parent draft, receipt, and preferences through close and completion", async () => {
	const parentDraft = JSON.stringify({ title: "Parent draft", description: "Keep text" });
	const parentReceipt = JSON.stringify({ identifier: "TRL-10", assignment: null });
	storage.set("trellis-composer-draft", parentDraft);
	storage.set("trellis-composer-submission", parentReceipt);
	const childKey = "trellis-composer:related:parent";
	storage.set(`${childKey}-submission`, JSON.stringify({ identifier: "TRL-20", assignment: null }));
	const selected: string[] = [];
	let closed = 0;
	const f = await fixture(false, {
		storagePrefix: childKey,
		initialTitle: "Child title",
		options: { project: "TRL" },
		onClose: () => {
			closed++;
		},
		onCreated: async (identifier) => {
			selected.push(identifier);
			return true;
		},
	});
	expect(f.current().draft.title).toBe("Child title");
	expect(f.current().submission.receipt?.identifier).toBe("TRL-20");
	const parentPreference = useComposerStore.getState().assignAgent;
	await act(async () => f.current().onAssignAgent(!parentPreference));
	expect(useComposerStore.getState().assignAgent).toBe(parentPreference);
	await act(async () => f.current().close());
	expect(closed).toBe(1);
	expect(selected).toEqual([]);
	expect(storage.get(`${childKey}-submission`)).toContain("TRL-20");
	expect(storage.get("trellis-composer-draft")).toBe(parentDraft);
	expect(storage.get("trellis-composer-submission")).toBe(parentReceipt);
	await act(async () => {
		await Promise.all([f.current().finish(false), f.current().finish(false)]);
	});
	expect(selected).toEqual(["TRL-20"]);
	expect(storage.has(`${childKey}-submission`)).toBe(false);
	expect(storage.has(`${childKey}-draft`)).toBe(false);
	expect(storage.get("trellis-composer-draft")).toBe(parentDraft);
	expect(storage.get("trellis-composer-submission")).toBe(parentReceipt);
});

test("a saved child receipt permits missing-file recovery but keeps ticket fields locked", async () => {
	const scope = "related-missing-files";
	storage.set(`${scope}-submission`, JSON.stringify({ identifier: "TRL-30", assignment: null }));
	storage.set(`${scope}:uploads`, JSON.stringify([{ id: "file-1", name: "proof.txt", size: 5, lastModified: 12 }]));
	const f = await fixture(false, {
		storagePrefix: scope,
		initialTitle: "Child",
		options: { project: "TRL" },
		onClose() {},
		onCreated: async () => true,
	});
	expect(f.current().locked).toBe(true);
	expect(f.current().attachmentsLocked).toBe(false);
	expect(f.current().uploads.missingFiles).toEqual(["proof.txt"]);
	await act(async () => f.current().create());
	expect(f.current().submission.failure?.stage).toBe("uploading");
	expect(storage.get(`${scope}-submission`)).toContain("TRL-30");
	await act(async () => f.current().uploads.addFiles([new File(["proof"], "proof.txt", { lastModified: 12 })]));
	expect(f.current().uploads.missingFiles).toEqual([]);
	expect(f.current().uploads.uploads[0]?.id).toBe("file-1");
	expect(f.current().locked).toBe(true);
});

test("a child assignment preserves the parent's recent agent preference", async () => {
	const scope = "related-agent-choice";
	const childChoice = { ...remembered, model: null, effort: null, accountId: null };
	storage.set(
		`${scope}-submission`,
		JSON.stringify({
			identifier: "TRL-31",
			assignment: { choice: childChoice, requestId: "child-assignment", complete: false },
		}),
	);
	let assigned = 0;
	const f = await fixture(
		false,
		{
			storagePrefix: scope,
			initialTitle: "Child",
			options: { project: "TRL" },
			onClose() {},
			onCreated: async () => true,
		},
		async () => {
			assigned++;
			return {} as AgentRun;
		},
	);
	await act(async () => f.current().create());
	expect(assigned).toBe(1);
	expect(useRecentChoices.getState().recent).toEqual([remembered]);
});
