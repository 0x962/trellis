import { expect, test } from "bun:test";
import { type Deps, run } from "../index.ts";

const fixture = () => {
	const calls: { path: string; input: unknown }[] = [];
	const output: string[] = [];
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "agent:Builder" },
		stdout: { write: (text: string) => output.push(text), isTTY: false },
		stderr: { write: () => {}, isTTY: false },
		stdin: async () => "",
		gitUserName: () => "Sam",
		osUser: () => "sam",
		now: () => new Date(),
		signal: new AbortController().signal,
		apiVersion: "1",
		home: "/home/test",
		fetch: async (request: Request) => {
			const path = new URL(request.url).pathname;
			const input = ((await request.json()) as { json: unknown }).json;
			calls.push({ path, input });
			const reply =
				path === "/rpc/tickets/get"
					? { project: { key: "DEMO" }, epic: { ref: "DEMO/parent-plan" }, wave: { ref: "DEMO/parent-plan/work" } }
					: { identifier: "DEMO-2", epic: { ref: "DEMO/default" }, wave: { ref: "DEMO/default/default" } };
			return Response.json({ json: reply }, { headers: { "x-trellis-api-version": "1" } });
		},
	} as unknown as Deps;
	return { deps, calls, output };
};

test("ticket create sends the explicit epic and wave for server validation", async () => {
	const f = fixture();
	expect(
		await run(
			[
				"ticket",
				"create",
				"-p",
				"DEMO",
				"-t",
				"Child",
				"--parent",
				"DEMO-1",
				"--epic",
				"DEMO/plan",
				"--wave",
				"DEMO/plan/work",
			],
			f.deps,
		),
	).toBe(0);
	expect(f.calls).toEqual([
		{
			path: "/rpc/tickets/create",
			input: { project: "DEMO", title: "Child", parent: "DEMO-1", epic: "DEMO/plan", wave: "DEMO/plan/work" },
		},
	]);
});

test("ticket create leaves the epic to the selected wave", async () => {
	const f = fixture();
	expect(await run(["ticket", "create", "-p", "DEMO", "-t", "Task", "--wave", "DEMO/plan/work"], f.deps)).toBe(0);
	expect(f.calls).toEqual([
		{ path: "/rpc/tickets/create", input: { project: "DEMO", title: "Task", wave: "DEMO/plan/work" } },
	]);
});

test("ticket create delegates omitted selections to the server and prints the returned defaults", async () => {
	const f = fixture();
	expect(await run(["ticket", "create", "-p", "DEMO", "-t", "Task", "--json"], f.deps)).toBe(0);
	expect(f.calls).toEqual([{ path: "/rpc/tickets/create", input: { project: "DEMO", title: "Task" } }]);
	expect(JSON.parse(f.output.join(""))).toEqual({
		identifier: "DEMO-2",
		epic: { ref: "DEMO/default" },
		wave: { ref: "DEMO/default/default" },
	});
});

test("legacy sub copies the parent project and leaves placement to the server", async () => {
	const f = fixture();
	expect(await run(["sub", "DEMO-1", "-t", "Child"], f.deps)).toBe(0);
	expect(f.calls).toEqual([
		{ path: "/rpc/tickets/get", input: { ticket: "DEMO-1" } },
		{ path: "/rpc/tickets/create", input: { project: "DEMO", parent: "DEMO-1", title: "Child" } },
	]);
});

test("legacy sub sends its own epic and wave selections", async () => {
	const f = fixture();
	expect(
		await run(
			["sub", "DEMO-1", "-p", "DEMO", "-t", "Child", "--epic", "DEMO/plan", "--wave", "DEMO/plan/work"],
			f.deps,
		),
	).toBe(0);
	expect(f.calls).toEqual([
		{
			path: "/rpc/tickets/create",
			input: { project: "DEMO", parent: "DEMO-1", title: "Child", epic: "DEMO/plan", wave: "DEMO/plan/work" },
		},
	]);
});
