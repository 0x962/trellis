import { expect, test } from "bun:test";
import { type Deps, run } from "../index.ts";

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
