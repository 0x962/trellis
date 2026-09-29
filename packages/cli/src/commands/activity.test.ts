import { expect, test } from "bun:test";
import type { Ticket, TimelineItem } from "@trellis/api";
import { type Deps, run } from "../index.ts";

const ticketId = "01M3NZ51A48E7R15BHEY4FFC9G";
const projectId = "01M24SPHTX36AJ3VKTNZ263E7V";
const batchId = "01M3P0QZCCN03Z0G7V64BNKTDR";

const activity = (id: number): TimelineItem => ({
	kind: "activity",
	id,
	batchId,
	projectId,
	ticketId,
	actor: { name: "Builder", kind: "agent" },
	action: "ticket.updated",
	field: "title",
	fromValue: `Title ${id + 1}`,
	toValue: `Title ${id}`,
	meta: {},
	createdAt: new Date(Date.UTC(2026, 8, 29, 12, 0, 0) - id * 1_000).toISOString(),
});

const ticket: Ticket = {
	id: ticketId,
	identifier: "TRL-717",
	number: 717,
	title: "Read all requested activity in the CLI",
	priority: "high",
	status: {
		id: "01M24SPHV037B820NQGKK6AEEF",
		slug: "in-progress",
		name: "In Progress",
		category: "started",
		color: "accent",
	},
	project: { id: projectId, key: "TRL" },
	parent: null,
	ancestors: [],
	epic: null,
	wave: null,
	childCount: 0,
	childDoneCount: 0,
	attachmentCount: 0,
	labels: [],
	waitsOn: [],
	releases: [],
	ready: true,
	pr: null,
	prRows: [],
	lastActor: null,
	position: 0,
	version: 1,
	createdAt: "2026-09-29T07:00:00.000Z",
	updatedAt: "2026-09-29T07:00:00.000Z",
	completedAt: null,
	description: "",
	contract: { result: "", files: [], leaveAlone: [], verify: [], reviewFocus: [] },
	outcome: "",
	children: [],
	prs: [],
	attachments: [],
};

const fixture = (reply: (path: string, input: Record<string, unknown>) => unknown) => {
	const output: string[] = [];
	const errors: string[] = [];
	const calls: Array<{ path: string; input: Record<string, unknown> }> = [];
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "agent:Builder" },
		stdout: { write: (text: string) => output.push(text), isTTY: false },
		stderr: { write: (text: string) => errors.push(text), isTTY: false },
		stdin: async () => "",
		gitUserName: () => "Sam",
		osUser: () => "sam",
		now: () => new Date("2026-09-29T12:00:00.000Z"),
		sleep: async () => {},
		open: () => {},
		signal: new AbortController().signal,
		apiVersion: "1",
		home: "/home/test",
		fetch: async (request: Request) => {
			const path = new URL(request.url).pathname;
			const input = ((await request.json()) as { json: Record<string, unknown> }).json;
			calls.push({ path, input });
			return Response.json({ json: reply(path, input) }, { headers: { "x-trellis-api-version": "1" } });
		},
	} as unknown as Deps;
	return { deps, calls, text: () => output.join(""), errors: () => errors.join("") };
};

test("activity --all follows each cursor and keeps the order across an empty page", async () => {
	const first = Array.from({ length: 100 }, (_, index) => activity(120 - index));
	const last = Array.from({ length: 20 }, (_, index) => activity(20 - index));
	const f = fixture((path, input) => {
		expect(path).toBe("/rpc/timeline/list");
		if (input.before === undefined) return { items: first, nextCursor: "FIRST" };
		if (input.before === "FIRST") return { items: [], nextCursor: "SECOND" };
		return { items: last, nextCursor: null };
	});

	expect(await run(["activity", "list", "TRL-717", "--all"], f.deps)).toBe(0);
	expect((JSON.parse(f.text()) as TimelineItem[]).map((item) => item.id)).toEqual([
		...first.map((item) => item.id),
		...last.map((item) => item.id),
	]);
	expect(f.calls.map((call) => call.input)).toEqual([
		{ ticket: "TRL-717", limit: 100 },
		{ ticket: "TRL-717", before: "FIRST", limit: 100 },
		{ ticket: "TRL-717", before: "SECOND", limit: 100 },
	]);
});

test("activity --limit reads the exact count across pages", async () => {
	const first = Array.from({ length: 100 }, (_, index) => activity(105 - index));
	const last = Array.from({ length: 5 }, (_, index) => activity(5 - index));
	const f = fixture((_path, input) =>
		input.before === undefined ? { items: first, nextCursor: "NEXT" } : { items: last, nextCursor: "UNUSED" },
	);

	expect(await run(["activity", "list", "TRL-717", "--limit", "105"], f.deps)).toBe(0);
	expect(JSON.parse(f.text())).toHaveLength(105);
	expect(f.calls.map((call) => call.input)).toEqual([
		{ ticket: "TRL-717", limit: 100 },
		{ ticket: "TRL-717", before: "NEXT", limit: 5 },
	]);
});

test("ticket show --activity reads all activity pages", async () => {
	const first = Array.from({ length: 100 }, (_, index) => activity(101 - index));
	const last = [activity(1)];
	const f = fixture((path, input) => {
		if (path === "/rpc/tickets/get") return ticket;
		return input.before === undefined ? { items: first, nextCursor: "NEXT" } : { items: last, nextCursor: null };
	});

	expect(await run(["ticket", "show", "TRL-717", "--activity"], f.deps)).toBe(0);
	const result = JSON.parse(f.text()) as { timeline: { items: TimelineItem[]; nextCursor: string | null } };
	expect(result.timeline.items.map((item) => item.id)).toEqual([...first, ...last].map((item) => item.id));
	expect(result.timeline.nextCursor).toBeNull();
	expect(f.calls.map((call) => call.input)).toEqual([
		{ ticket: "TRL-717" },
		{ ticket: "TRL-717", limit: 100 },
		{ ticket: "TRL-717", before: "NEXT", limit: 100 },
	]);
});

test("activity help documents complete output", async () => {
	const f = fixture(() => ({}));
	expect(await run(["activity", "list", "--help"], f.deps)).toBe(0);
	expect(f.text()).toContain("--all");
	expect(f.text()).toContain("Every row, streamed page by page");
	expect(f.calls).toEqual([]);
});
