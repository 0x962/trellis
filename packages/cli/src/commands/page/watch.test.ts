import { expect, test } from "bun:test";
import { type Deps, run } from "../../index.ts";

const fixture = () => {
	const calls: { path: string; input: unknown }[] = [];
	const output: string[] = [];
	const errors: string[] = [];
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "human:reader" },
		stdout: { write: (text: string) => output.push(text), isTTY: false },
		stderr: { write: (text: string) => errors.push(text), isTTY: false },
		stdin: async () => "",
		gitUserName: () => "reader",
		osUser: () => "reader",
		now: () => new Date(),
		signal: new AbortController().signal,
		apiVersion: "1",
		home: "/home/test",
		fetch: async (request: Request) => {
			const input = ((await request.json()) as { json: unknown }).json;
			calls.push({ path: new URL(request.url).pathname, input });
			return Response.json({ json: { id: "page", watcher: input } }, { headers: { "x-trellis-api-version": "1" } });
		},
	} as unknown as Deps;
	return { deps, calls, output, errors };
};

test("watch and unwatch send explicit watcher assignments and return JSON", async () => {
	const f = fixture();
	expect(
		await run(["page", "watch", "TRL/pages/report", "--agent", "01M3DK4BZTBC3YYWAQMN0R6XYS", "--json"], f.deps),
	).toBe(0);
	expect(f.calls[0]).toEqual({
		path: "/rpc/pages/watch",
		input: { page: "TRL/pages/report", agentId: "01M3DK4BZTBC3YYWAQMN0R6XYS" },
	});
	expect(JSON.parse(f.output.join(""))).toHaveProperty("watcher");
	expect(await run(["page", "unwatch", "TRL/pages/report", "--json"], f.deps)).toBe(0);
	expect(f.calls[1]).toEqual({ path: "/rpc/pages/watch", input: { page: "TRL/pages/report", agentId: null } });
});

test("watch requires an explicit agent", async () => {
	const f = fixture();
	expect(await run(["page", "watch", "TRL/pages/report"], f.deps)).toBe(2);
	expect(f.calls).toHaveLength(0);
});
