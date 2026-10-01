import { expect, test } from "bun:test";
import type { Deps } from "../index.ts";
import { run } from "../index.ts";

test.each([
	{ args: [], expected: "-createdAt" },
	{ args: ["--sort", "-updatedAt"], expected: "-updatedAt" },
])("ticket list sends $expected", async ({ args, expected }) => {
	const calls: { sort: string }[] = [];
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "human:Navid" },
		stdout: { write: () => {}, isTTY: false },
		stderr: { write: () => {}, isTTY: false },
		stdin: async () => "",
		gitUserName: () => "Navid",
		osUser: () => "navid",
		now: () => new Date("2026-09-30T00:00:00Z"),
		signal: new AbortController().signal,
		apiVersion: "1",
		fetch: async (request: Request) => {
			calls.push(((await request.json()) as { json: { sort: string } }).json);
			return Response.json({ json: { items: [], nextCursor: null } }, { headers: { "x-trellis-api-version": "1" } });
		},
	} as unknown as Deps;
	expect(await run(["ticket", "list", ...args], deps)).toBe(0);
	expect(calls).toHaveLength(1);
	expect(calls[0]!.sort).toBe(expected);
});
