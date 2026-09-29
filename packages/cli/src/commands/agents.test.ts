import { expect, test } from "bun:test";
import { type Deps, run } from "../index.ts";

const agent = (id: string, name: string) => ({
	id,
	name,
	accountId: null,
	switchedTo: null,
	runtime: "native",
	harness: null,
	kind: "agent",
	projectId: null,
	projectKey: "TRL",
	ticketId: null,
	ticketIdentifier: null,
	ticketTitle: null,
	ticketStatusCategory: null,
	ticketEpicId: null,
	ticketEpicProjectId: null,
	pinnedAt: null,
	assigned: false,
	state: "exited",
	processStatus: "exited",
	observation: null,
	workspaceId: null,
	terminalId: null,
	url: null,
	error: null,
	sessionId: null,
	sessionLost: false,
	activityAt: null,
	createdAt: "2026-09-29T07:00:00.000Z",
	updatedAt: "2026-09-29T07:00:00.000Z",
});

test("agent broadcast sends the selected group and text", async () => {
	const calls: { path: string; input: unknown }[] = [];
	let output = "";
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "human:Navid" },
		stdout: { write: (text: string) => (output += text), isTTY: false },
		stderr: { write: () => {}, isTTY: false },
		stdin: async () => "Check the release",
		gitUserName: () => "Navid",
		osUser: () => "navid",
		now: () => new Date(),
		signal: new AbortController().signal,
		apiVersion: "1",
		fetch: async (request: Request) => {
			const path = new URL(request.url).pathname;
			const input = ((await request.json()) as { json: unknown }).json;
			calls.push({ path, input });
			return Response.json(
				{ json: { group: "working", recipientCount: 2, acceptedCount: 2, failures: [] } },
				{ headers: { "x-trellis-api-version": "1" } },
			);
		},
	} as unknown as Deps;

	expect(
		await run(["agent", "broadcast", "--group", "working", "--text", "-", "--request-id", "release-check"], deps),
	).toBe(0);
	expect(calls).toEqual([
		{
			path: "/rpc/agentRuns/broadcast",
			input: { group: "working", text: "Check the release", requestId: "release-check" },
		},
	]);
	expect(JSON.parse(output)).toEqual({ group: "working", recipientCount: 2, acceptedCount: 2, failures: [] });
});

test("agent list follows every cursor for all rows", async () => {
	const calls: unknown[] = [];
	let output = "";
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "human:Navid" },
		stdout: { write: (text: string) => (output += text), isTTY: false },
		stderr: { write: () => {}, isTTY: false },
		stdin: async () => "",
		gitUserName: () => "Navid",
		osUser: () => "navid",
		now: () => new Date(),
		signal: new AbortController().signal,
		apiVersion: "1",
		fetch: async (request: Request) => {
			const input = ((await request.json()) as { json: { cursor?: string } }).json;
			calls.push(input);
			return Response.json(
				{
					json:
						input.cursor === undefined
							? { items: [agent("01ARZ3NDEKTSV4RRFFQ69G5FAV", "First")], nextCursor: "next" }
							: { items: [agent("01ARZ3NDEKTSV4RRFFQ69G5FAW", "Second")], nextCursor: null },
				},
				{ headers: { "x-trellis-api-version": "1" } },
			);
		},
	} as unknown as Deps;

	expect(await run(["agent", "list", "--all", "--project", "TRL"], deps)).toBe(0);
	expect(JSON.parse(output).map((row: { name: string }) => row.name)).toEqual(["First", "Second"]);
	expect(calls).toEqual([
		{ project: "TRL", allHistory: true, limit: 1000 },
		{ project: "TRL", allHistory: true, cursor: "next", limit: 1000 },
	]);
});
