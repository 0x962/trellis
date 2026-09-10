import { expect, test } from "bun:test";
import type { QueryClient } from "@tanstack/query-core";
import { detailKey, healthKey, inboxKey, isInvalidated, listKey, setup } from "../test/applierHarness.ts";
import { agentSession, projectId, queryKey } from "../test/fixtures.ts";

const projectSessionsKey = queryKey(["agents", "sessions"], { project: "CDE" });
const ticketSessionsKey = queryKey(["agents", "sessions"], { ticket: "CDE-42" });
const settingsKey = queryKey(["agents", "settings"]);
const overviewKey = queryKey(["agents", "overview"]);

const seed = (queryClient: QueryClient) => {
	queryClient.setQueryData(projectSessionsKey, { sessions: [] });
	queryClient.setQueryData(ticketSessionsKey, { sessions: [] });
	queryClient.setQueryData(settingsKey, { runner: "superset", enabled: false, projects: [] });
	queryClient.setQueryData(overviewKey, { sessions: [], actions: [], tickets: [], batches: [] });
	queryClient.setQueryData(listKey, { items: [], nextCursor: null });
	queryClient.setQueryData(detailKey, { id: projectId });
	queryClient.setQueryData(inboxKey, { review: { items: [], total: 0 } });
	queryClient.setQueryData(healthKey, { ok: true });
};

// The project header and the ticket's Agents row read `agents.sessions`, and
// the Activity page reads `agents.overview`. A session event changes the
// state or the last wake time of one session and no ticket row, so only the
// session lists and the overview refetch.
test("agents.session invalidates every agents.sessions query and the overview, and nothing else", () => {
	const { queryClient, advanceTo, applier } = setup(seed);
	applier.applyEvent({ type: "agents.session", session: agentSession() });
	advanceTo(1000);
	expect(isInvalidated(queryClient, projectSessionsKey)).toBe(true);
	expect(isInvalidated(queryClient, ticketSessionsKey)).toBe(true);
	expect(isInvalidated(queryClient, overviewKey)).toBe(true);
	for (const key of [settingsKey, listKey, detailKey, inboxKey, healthKey]) {
		expect(isInvalidated(queryClient, key), JSON.stringify(key)).toBe(false);
	}
});

// A batch only wakes the manager. The wake itself arrives as an
// agents.session event, so the batch event refetches only the overview,
// which lists the batches.
test("agents.batch invalidates the overview and nothing else", () => {
	const { queryClient, advanceTo, applier } = setup(seed);
	applier.applyEvent({ type: "agents.batch", projectId, count: 7 });
	advanceTo(1000);
	expect(isInvalidated(queryClient, overviewKey)).toBe(true);
	for (const key of [projectSessionsKey, ticketSessionsKey, settingsKey, listKey, detailKey, inboxKey, healthKey]) {
		expect(isInvalidated(queryClient, key), JSON.stringify(key)).toBe(false);
	}
});
