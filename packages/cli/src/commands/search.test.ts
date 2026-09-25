import { expect, test } from "bun:test";
import type { Deps } from "../index.ts";
import { run } from "../index.ts";

const page = {
	id: "01M3D000000000000000000000",
	projectId: "01M3D000000000000000000001",
	projectKey: "TRL",
	ref: "TRL/pages/forecast",
	slug: "forecast",
	title: "Forecast",
	summary: "The forecast of the quarter.",
	revision: 2,
	latestVersion: 2,
	creator: { name: "Navid", kind: "human" },
	actor: { name: "Navid", kind: "human" },
	publishedBy: { name: "Navid", kind: "human" },
	publishedAt: "2026-09-25T12:00:00.000Z",
	watcher: null,
	pinned: false,
	openThreadCount: 0,
	deletedAt: null,
	deletedBy: null,
	purgeAt: null,
	createdAt: "2026-09-25T12:00:00.000Z",
	updatedAt: "2026-09-25T12:00:00.000Z",
};

const fixture = () => {
	let output = "";
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "human:Navid" },
		stdout: { write: (text: string) => (output += text), isTTY: true },
		stderr: { write: () => {}, isTTY: true },
		stdin: async () => "",
		gitUserName: () => "Navid",
		osUser: () => "navid",
		now: () => new Date("2026-09-25T12:00:00.000Z"),
		sleep: async () => {},
		open: () => {},
		signal: new AbortController().signal,
		apiVersion: "1",
		fetch: async () =>
			Response.json(
				{ json: { tickets: [], pages: [page], projects: [] } },
				{ headers: { "x-trellis-api-version": "1" } },
			),
	} as unknown as Deps;
	return { deps, output: () => output };
};

test("prints Page results between tickets and projects", async () => {
	const f = fixture();

	expect(await run(["search", "forecast", "--no-color"], f.deps)).toBe(0);
	expect(f.output()).toBe(
		"tickets\n(none)\n\npages\nref                 title     summary                       version\n" +
			"TRL/pages/forecast  Forecast  The forecast of the quarter.  2\n\nprojects\n(none)\n",
	);
});

test("prints the Page ref in quiet output", async () => {
	const f = fixture();

	expect(await run(["search", "forecast", "--quiet"], f.deps)).toBe(0);
	expect(f.output()).toBe("TRL/pages/forecast\n");
});
