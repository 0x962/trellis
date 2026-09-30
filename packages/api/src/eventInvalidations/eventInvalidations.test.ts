import { expect, test } from "bun:test";
import { generateOperationKey } from "@orpc/tanstack-query";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { createEventApplier } from "../query-keys.ts";
import type { Scheduler } from "../scheduler.ts";
import { session } from "../sessionStatus/fixture.ts";

const runId = "01M3DZE27HMH2NR7Z57MMXRFCA";
const otherId = "01M3FWVSKDTFCQA0V547BVT1ME";
const activity = {
	run: { ...session().run, id: runId, sessionId: null },
	sessionId: null,
};

const setup = () => {
	let flush = () => {};
	const scheduler: Scheduler = {
		now: () => 0,
		setTimeout: (callback) => {
			flush = callback;
			return 1;
		},
		clearTimeout: () => {},
	};
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	const applier = createEventApplier(client, { scheduler });
	return { client, applier, flush: () => flush() };
};

const key = (procedure: string, input: Record<string, unknown> = {}) =>
	generateOperationKey(["agentRuns", procedure], { input });

test("status events refresh agent state without restarting workspace counts", async () => {
	const { client, applier, flush } = setup();
	let listReads = 0;
	const workspaceReads: string[] = [];
	const canceled: string[] = [];
	const releases: Array<() => void> = [];
	const subscriptions: Array<() => void> = [];
	const listKey = key("list");
	client.setQueryData(listKey, []);
	subscriptions.push(
		new QueryObserver(client, {
			queryKey: listKey,
			queryFn: async () => {
				listReads++;
				return [];
			},
		}).subscribe(() => {}),
	);
	for (const procedure of ["workspaceSummary", "workspaceLineStats"]) {
		const queryKey = key(procedure, { runId });
		client.setQueryData(queryKey, {});
		const observer = new QueryObserver(client, {
			queryKey,
			queryFn: ({ signal }) => {
				workspaceReads.push(procedure);
				signal.addEventListener("abort", () => canceled.push(procedure));
				return new Promise<object>((resolve) => releases.push(() => resolve({})));
			},
		});
		subscriptions.push(observer.subscribe(() => {}));
		void observer.refetch();
	}
	for (let index = 0; index < 5; index++) {
		applier.applyEvent({ type: "agent-runs.status", activity, notify: true });
		flush();
		await Promise.resolve();
		await Promise.resolve();
	}
	expect(listReads).toBeGreaterThan(0);
	expect(workspaceReads).toEqual(["workspaceSummary", "workspaceLineStats"]);
	expect(canceled).toEqual([]);
	for (const release of releases) release();
	await Promise.resolve();
	for (const unsubscribe of subscriptions) unsubscribe();
	client.clear();
});

test("status events refresh the changed run details and the session list", () => {
	const { client, applier, flush } = setup();
	const changed = [
		key("activity"),
		key("broadcastRecipients"),
		key("ticketMetrics"),
		...["session", "output", "terminalOutput"].map((name) => key(name, { id: runId })),
		...["workspace", "file"].map((name) => key(name, { runId })),
		generateOperationKey(["sessions", "list"], {}),
	];
	const untouched = [
		key("workspaceSummary", { runId }),
		key("workspaceSummary", { runId: otherId }),
		key("workspaceLineStats", { ticketIds: [] }),
		key("session", { id: otherId }),
		key("workspace", { runId: otherId }),
		key("file", { runId: otherId }),
	];
	for (const queryKey of [...changed, ...untouched]) client.setQueryData(queryKey, {});
	applier.applyEvent({ type: "agent-runs.status", activity, notify: false });
	flush();
	for (const queryKey of changed) expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
	for (const queryKey of untouched) expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
	client.clear();
});

test("a run mutation still refreshes its workspace state", () => {
	const { client, applier, flush } = setup();
	const queryKey = key("workspaceSummary", { runId });
	client.setQueryData(queryKey, {});
	applier.applyEvent({ type: "agent-runs.changed", id: runId });
	flush();
	expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
	client.clear();
});

test("a saved session update refreshes the session update query", () => {
	const { client, applier, flush } = setup();
	const runId = "01M3NVQ8K3ZBWDFDZ406A4M1D9";
	const queryKey = generateOperationKey(["sessionUpdates", "get"], { input: { sessionId: runId } });
	client.setQueryData(queryKey, {});
	applier.applyEvent({ type: "session-updates.changed", id: runId });
	flush();
	expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
	client.clear();
});
