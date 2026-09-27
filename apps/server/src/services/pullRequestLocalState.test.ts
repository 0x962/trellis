import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { openPullRequestLocalStateTest } from "./pullRequestLocalState.testSupport.ts";
import { setLocalState } from "./pullRequestLocalState.ts";
import { setHeadSha } from "./pullRequests.ts";

let h: Awaited<ReturnType<typeof openPullRequestLocalStateTest>>;

beforeAll(async () => {
	h = await openPullRequestLocalStateTest();
}, 60_000);

beforeEach(() => {
	h.events.length = 0;
});

afterAll(async () => {
	await h.close();
});

test("a pull request that an agent links waits for the agent to ask for review", async () => {
	const ticket = await h.newTicket("Link as an agent");

	const linked = await h.linkAs(h.agent, ticket.identifier, 101);

	expect(linked.localState).toBe("not-ready");
	expect(linked.reviewGaps).toContainEqual({ kind: "not-asked", count: 1 });
});

test("a pull request that a person links starts as ready", async () => {
	const ticket = await h.newTicket("Link as a person");

	const linked = await h.linkAs(h.person, ticket.identifier, 102);

	expect(linked.localState).toBe("ready");
});

test("a second link of the same pull request keeps the state that trellis ready set", async () => {
	const ticket = await h.newTicket("Link the same one twice");
	const linked = await h.linkAs(h.agent, ticket.identifier, 103);
	await h.run((tx) => setLocalState(h.ctxOf(h.agent), tx, { id: linked.id, localState: "ready" }));

	const again = await h.linkAs(h.agent, ticket.identifier, 103);

	expect(again.localState).toBe("ready");
});

test("setLocalState writes the state, announces the update and moves the inbox item", async () => {
	const ticket = await h.newTicket("Ask for review");
	const linked = await h.linkAs(h.agent, ticket.identifier, 104);
	await h.writeParts(linked.id, "head104");
	const beforeGaps = await h.gapsOf(ticket.id);
	const beforeInbox = await h.inboxOf();
	h.events.length = 0;

	const ready = await h.run((tx) => setLocalState(h.ctxOf(h.agent), tx, { id: linked.id, localState: "ready" }));

	expect(beforeGaps).toEqual(["not-asked"]);
	expect(beforeInbox).not.toContain(ticket.identifier);
	expect(ready.localState).toBe("ready");
	expect(h.events.map((event) => event.type)).toEqual(["pr.updated"]);
	expect(await h.gapsOf(ticket.id)).toEqual([]);
	expect(await h.inboxOf()).toContain(ticket.identifier);
});

test("the ask stamps the moment the wait started and writes the timeline row", async () => {
	const ticket = await h.newTicket("Stamp the wait");
	const linked = await h.linkAs(h.agent, ticket.identifier, 111);
	await h.writeParts(linked.id, "head111");

	const ready = await h.run((tx) => setLocalState(h.ctxOf(h.agent), tx, { id: linked.id, localState: "ready" }));
	const stamped = await h.readyAtOf(linked.id);
	const asked = await h.activityOf(linked.id);

	await h.run((tx) => setLocalState(h.ctxOf(h.person), tx, { id: linked.id, localState: "not-ready" }));

	expect(ready.readyForReviewAt).toBe(h.at.toISOString());
	expect(stamped).toBe(h.at.toISOString());
	expect(asked).toEqual([["pr.ready_for_review", "agent", "claude-code"]]);
	expect(await h.readyAtOf(linked.id)).toBeNull();
	expect(await h.activityOf(linked.id)).toEqual([
		["pr.ready_for_review", "agent", "claude-code"],
		["pr.not_ready_for_review", "human", "dana"],
	]);
});

test("a new head commit clears the moment the wait started", async () => {
	const { id } = await h.readyPullRequest("Push after the ask", 112);

	await h.run((tx) => setHeadSha(tx, { id, headSha: "pushed" }));

	expect(await h.readyAtOf(id)).toBeNull();
});

test("setLocalState to the stored state writes nothing once the moment stands", async () => {
	const ticket = await h.newTicket("Ask twice");
	const linked = await h.linkAs(h.person, ticket.identifier, 105);
	await h.run((tx) => setLocalState(h.ctxOf(h.person), tx, { id: linked.id, localState: "ready" }));
	h.events.length = 0;

	const same = await h.run((tx) =>
		setLocalState(h.ctxOf(h.person, h.later), tx, { id: linked.id, localState: "ready" }),
	);

	expect(same.localState).toBe("ready");
	expect(same.readyForReviewAt).toBe(h.at.toISOString());
	expect(h.events).toEqual([]);
});

test("a poll that finds a new head commit clears the moment the wait started", async () => {
	const { id } = await h.readyPullRequest("Poll after a push", 116);
	await h.poll(116, "head116");

	const kept = await h.readyAtOf(id);
	await h.poll(116, "pushed116");

	expect(kept).toBe(h.at.toISOString());
	expect(await h.readyAtOf(id)).toBeNull();
});

test("a merge leaves the moment the wait started", async () => {
	const { id } = await h.readyPullRequest("Merge after the ask", 117);

	await h.poll(117, "head117", "merged");

	expect(await h.readyAtOf(id)).toBe(h.at.toISOString());
});

test("the ask after a push stamps the new wait and writes a second timeline row", async () => {
	const { id } = await h.readyPullRequest("Ask again after a push", 115);
	await h.run((tx) => setHeadSha(tx, { id, headSha: "pushed115" }));

	const again = await h.run((tx) => setLocalState(h.ctxOf(h.agent, h.later), tx, { id, localState: "ready" }));

	expect(again.localState).toBe("ready");
	expect(again.readyForReviewAt).toBe(h.later.toISOString());
	expect(await h.activityOf(id)).toEqual([
		["pr.ready_for_review", "agent", "claude-code"],
		["pr.ready_for_review", "agent", "claude-code"],
	]);
});
