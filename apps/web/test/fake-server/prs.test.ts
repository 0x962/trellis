import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { LinkedPullRequestSchema, PrEventPayloadSchema } from "@trellis/api";
import { ghReady } from "../prs";
import { createFakeServer, type FakeServer } from "./index";
import { updatePr } from "./prs";
import { openEvents, parseData } from "./sse";

const url = "https://github.com/canary-technologies-corp/de/pull/900";

const firstPr = async (server: FakeServer, identifier: string) =>
	(await server.client.pullRequests.list({ ticket: identifier }))[0]!;

const ticketIdOf = async (server: FakeServer, identifier: string) =>
	(await server.client.tickets.get({ ticket: identifier })).id;

describe("fake server pull requests", () => {
	// PR-64
	test("link stores the pull request and emits pr.linked", async () => {
		const server = createFakeServer();
		ghReady(server);
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		const linked = LinkedPullRequestSchema.parse(await server.client.pullRequests.link({ ticket: "CDE-47", url }));
		expect(linked.owner).toBe("canary-technologies-corp");
		expect(linked.repo).toBe("de");
		expect(linked.number).toBe(900);
		expect(linked.url).toBe(url);
		expect(server.state.prs.get(linked.id)).toBeDefined();
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("pr.linked");
		const payload = PrEventPayloadSchema.parse(parseData(frame));
		expect(payload.id).toBe(linked.id);
		expect(payload.ticketIds).toEqual([await ticketIdOf(server, "CDE-47")]);
		stream.close();
		expect(await server.client.pullRequests.list({ ticket: "CDE-47" })).toHaveLength(1);
	});

	// PR-65. An agent that links the same URL twice keeps one row.
	test("link is idempotent for a URL the ticket already holds", async () => {
		const server = createFakeServer();
		ghReady(server);
		const first = await server.client.pullRequests.link({ ticket: "CDE-47", url });
		const second = await server.client.pullRequests.link({ ticket: "CDE-47", url });
		expect(second.id).toBe(first.id);
		expect(await server.client.pullRequests.list({ ticket: "CDE-47" })).toHaveLength(1);
		expect(server.state.prLinks.filter((link) => link.prId === first.id)).toHaveLength(1);
	});

	// PR-66
	test("link throws INVALID_PR_URL for a URL without a pull request number", async () => {
		const server = createFakeServer();
		ghReady(server);
		const { error } = await safe(server.client.pullRequests.link({ ticket: "CDE-47", url: "https://github.com/o/r" }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "INVALID_PR_URL") throw new Error("expected INVALID_PR_URL");
		expect(error.status).toBe(400);
		expect(await server.client.pullRequests.list({ ticket: "CDE-47" })).toHaveLength(0);
	});

	// PR-67. The seed reports gh as missing.
	test("link throws GH_UNAVAILABLE while gh is missing", async () => {
		const server = createFakeServer();
		const { error } = await safe(server.client.pullRequests.link({ ticket: "CDE-47", url }));
		expect(isDefinedError(error)).toBe(true);
		if (!isDefinedError(error) || error.code !== "GH_UNAVAILABLE") throw new Error("expected GH_UNAVAILABLE");
		expect(error.status).toBe(503);
		expect(error.data.reason).toBe("missing");
	});

	// PR-68
	test("refresh returns a newer fetch time and emits pr.updated", async () => {
		const server = createFakeServer();
		ghReady(server);
		const stored = await firstPr(server, "CDE-42");
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		const refreshed = await server.client.pullRequests.refresh({ id: stored.id });
		expect(refreshed.id).toBe(stored.id);
		expect(Date.parse(refreshed.fetchedAt!)).toBeGreaterThan(Date.parse(stored.fetchedAt!));
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("pr.updated");
		const payload = PrEventPayloadSchema.parse(parseData(frame));
		expect(payload.id).toBe(stored.id);
		expect(payload.ticketIds).toContain(await ticketIdOf(server, "CDE-42"));
		stream.close();
	});

	// PR-69
	test("updatePr patches the checks and emits the folded ci state", async () => {
		const server = createFakeServer();
		const stored = await firstPr(server, "CDE-42");
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		const event = updatePr(server, stored.id, {
			checks: [{ name: "lint", workflow: "ci", bucket: "fail", link: null }],
		});
		expect(server.state.prs.get(stored.id)!.checks).toHaveLength(1);
		expect(server.state.prs.get(stored.id)!.ciState).toBe("fail");
		expect(event).toEqual({
			id: stored.id,
			ticketIds: [await ticketIdOf(server, "CDE-42")],
			ticketIdentifiers: ["CDE-42"],
			owner: stored.owner,
			repo: stored.repo,
			number: stored.number,
			url: stored.url,
			title: stored.title,
			state: "open",
			ciState: "fail",
		});
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("pr.updated");
		expect(PrEventPayloadSchema.parse(parseData(frame))).toEqual(event);
		stream.close();
	});

	// PR-70. A stream scoped to one ticket carries that ticket's events only.
	test("sends pr.updated only to the streams scoped to the ticket", async () => {
		const server = createFakeServer();
		const quiet = await openEvents(server.app, "/api/events?ticket=CDE-42");
		const scoped = await openEvents(server.app, "/api/events?ticket=CDE-44");
		await quiet.nextEvent();
		await scoped.nextEvent();
		const stored = await firstPr(server, "CDE-44");
		updatePr(server, stored.id, { checks: [{ name: "lint", workflow: "ci", bucket: "pass", link: null }] });
		const frame = await scoped.nextEvent();
		expect(frame!.event).toBe("pr.updated");
		expect(PrEventPayloadSchema.parse(parseData(frame)).id).toBe(stored.id);
		const other = await Promise.race([quiet.nextEvent(), Bun.sleep(50).then(() => null)]);
		expect(other).toBeNull();
		quiet.close();
		scoped.close();
	});
});
