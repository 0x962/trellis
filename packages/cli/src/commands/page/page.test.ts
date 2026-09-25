import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Deps, run } from "../../index.ts";

type Call = { path: string; input: unknown; files: { name: string; type: string; size: number }[] };

const summary = {
	id: "01PAGE",
	projectId: "01PROJECT",
	projectKey: "TRL",
	ref: "TRL/pages/forecast",
	slug: "forecast",
	title: "Forecast",
	summary: "The forecast of the quarter.",
	revision: 3,
	latestVersion: 2,
	creator: { name: "sam", kind: "human" },
	actor: { name: "sam", kind: "human" },
	publishedBy: { name: "sam", kind: "human" },
	publishedAt: "2026-09-24T10:00:00.000Z",
	watcher: null,
	pinned: false,
	openThreadCount: 0,
	deletedAt: null,
	deletedBy: null,
	purgeAt: null,
	createdAt: "2026-09-24T10:00:00.000Z",
	updatedAt: "2026-09-24T10:00:00.000Z",
};

const version = {
	pageId: "01PAGE",
	number: 2,
	requestId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
	label: null,
	documentSha256: "a".repeat(64),
	documentSize: 15,
	sourceAgentId: null,
	sourcePath: "report.html",
	actor: { name: "sam", kind: "human" },
	createdAt: "2026-09-24T10:00:00.000Z",
};

// Every reply the page commands read, by procedure path. A test that needs
// another answer passes its own.
const defaultReply = (path: string): unknown => {
	switch (path) {
		case "/rpc/pages/upload":
			return { id: `01UPLOAD${uploadCount++}` };
		case "/rpc/pages/publish":
			return { page: summary, version };
		case "/rpc/pages/list":
			return { items: [summary], nextCursor: null };
		case "/rpc/pages/versions":
			return { items: [version], nextCursor: null };
		case "/rpc/pages/pull":
			return { page: summary, version, assets: [] };
		case "/rpc/pages/createRenderLease":
			return { id: "LEASE", contentRoot: "/api/page-render/LEASE/", pageId: "01PAGE", version: 2 };
		case "/rpc/pages/get":
			return { ...summary, requestedVersion: version, assetCount: 0, totalThreadCount: 0, resolvedThreadCount: 0 };
		case "/rpc/pages/pin":
			return { pageId: "01PAGE", pinned: true };
		default:
			return summary;
	}
};

let uploadCount = 1;

const fixture = (reply: (path: string, input: unknown) => unknown = defaultReply) => {
	const output: string[] = [];
	const errors: string[] = [];
	const calls: Call[] = [];
	uploadCount = 1;
	const deps = {
		env: { TRELLIS_URL: "http://test.local", TRELLIS_ACTOR: "agent:Builder" },
		stdout: { write: (text: string) => output.push(text), isTTY: false },
		stderr: { write: (text: string) => errors.push(text), isTTY: false },
		stdin: async () => "from standard input",
		gitUserName: () => "Sam",
		osUser: () => "sam",
		now: () => new Date("2026-09-24T12:00:00.000Z"),
		sleep: async () => {},
		open: () => {},
		signal: new AbortController().signal,
		apiVersion: "1",
		home: "/home/test",
		fetch: async (request: Request) => {
			const path = new URL(request.url).pathname;
			const headers = { "x-trellis-api-version": "1" };
			if (request.method === "GET") {
				calls.push({ path, input: null, files: [] });
				return new Response(`bytes of ${path}`, { headers });
			}
			const type = request.headers.get("content-type") ?? "";
			const files: Call["files"] = [];
			let input: unknown;
			if (type.startsWith("multipart/form-data")) {
				const form = await request.formData();
				input = JSON.parse(String(form.get("data"))).json;
				// The DOM types call every form value text, and an upload sends
				// its file in one of those values.
				for (const value of [...form.values()] as (File | string)[]) {
					if (typeof value !== "string") files.push({ name: value.name, type: value.type, size: value.size });
				}
			} else {
				input = ((await request.json()) as { json: unknown }).json;
			}
			calls.push({ path, input, files });
			return Response.json({ json: reply(path, input) }, { headers });
		},
	} as unknown as Deps;
	return { deps, calls, text: () => output.join(""), errors: () => errors.join("") };
};

const sources = () => {
	const dir = mkdtempSync(join(tmpdir(), "trellis-page-cli-"));
	mkdirSync(join(dir, "site/media"), { recursive: true });
	writeFileSync(join(dir, "report.html"), "<h1>Forecast</h1>");
	writeFileSync(join(dir, "site/index.html"), "<h1>Site</h1>");
	writeFileSync(join(dir, "site/style.css"), "body{color:red}");
	writeFileSync(join(dir, "site/media/logo.svg"), "<svg/>");
	return dir;
};

test("a first publication stages the document and names the project and the title", async () => {
	const dir = sources();
	try {
		const f = fixture();
		expect(
			await run(["page", "publish", join(dir, "report.html"), "--project", "TRL", "--title", "Forecast"], f.deps),
		).toBe(0);
		expect(f.calls.map((call) => call.path)).toEqual(["/rpc/pages/upload", "/rpc/pages/publish"]);
		expect(f.calls[0]!.input).toMatchObject({ project: "TRL" });
		expect(f.calls[0]!.files[0]).toMatchObject({ name: "index.html", size: 17 });
		expect(f.calls[0]!.files[0]!.type).toContain("text/html");
		expect(f.calls[1]!.input).toMatchObject({
			project: "TRL",
			title: "Forecast",
			document: "01UPLOAD1",
			assets: [],
			sourcePath: "report.html",
		});
		// Every publication carries its own identifier, so a retry of one
		// publication reads the version the first call created.
		expect((f.calls[1]!.input as { requestId: string }).requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
		expect(JSON.parse(f.text())).toMatchObject({ page: { ref: "TRL/pages/forecast" }, version: { number: 2 } });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a directory stages every file and sends each asset under its own path", async () => {
	const dir = sources();
	try {
		const f = fixture();
		expect(await run(["page", "publish", join(dir, "site"), "--project", "TRL", "--title", "Site"], f.deps)).toBe(0);
		expect(f.calls.map((call) => call.path)).toEqual([
			"/rpc/pages/upload",
			"/rpc/pages/upload",
			"/rpc/pages/upload",
			"/rpc/pages/publish",
		]);
		expect(f.calls.slice(0, 3).map((call) => call.files[0]!.name)).toEqual(["index.html", "logo.svg", "style.css"]);
		expect(f.calls[3]!.input).toMatchObject({
			assets: [
				{ uploadId: "01UPLOAD2", path: "media/logo.svg" },
				{ uploadId: "01UPLOAD3", path: "style.css" },
			],
			document: "01UPLOAD1",
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a new version reads the project of its page and keeps the revision the caller sent", async () => {
	const dir = sources();
	try {
		const f = fixture();
		const argv = [
			"page",
			"publish",
			join(dir, "report.html"),
			"--page",
			"TRL/pages/forecast",
			"--expected-version",
			"3",
			"--label",
			"Second draft",
			"--request-id",
			"1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
		];
		expect(await run(argv, f.deps)).toBe(0);
		expect(f.calls.map((call) => call.path)).toEqual(["/rpc/pages/get", "/rpc/pages/upload", "/rpc/pages/publish"]);
		expect(f.calls[1]!.input).toMatchObject({ project: "01PROJECT" });
		expect(f.calls[2]!.input).toMatchObject({
			page: "TRL/pages/forecast",
			expectedVersion: 3,
			label: "Second draft",
			requestId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
		});
		expect(f.calls[2]!.input).not.toHaveProperty("project");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a publication that names no page and no project makes no request", async () => {
	const dir = sources();
	try {
		for (const [argv, message] of [
			[[], "publish needs --project or --page"],
			[["--project", "TRL", "--page", "TRL/pages/forecast"], "publish takes --project or --page, not both"],
			[["--project", "TRL"], "a new page needs --title"],
			[["--page", "TRL/pages/forecast"], "a new version needs --expected-version"],
			[
				["--page", "TRL/pages/forecast", "--expected-version", "0"],
				'--expected-version needs a positive integer, not "0"',
			],
		] as [string[], string][]) {
			const f = fixture();
			expect(await run(["page", "publish", join(dir, "report.html"), ...argv], f.deps)).toBe(2);
			expect(f.errors()).toContain(message);
			expect(f.calls.filter((call) => call.path === "/rpc/pages/publish")).toEqual([]);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the page list sends the filters of the command line and follows the cursors", async () => {
	const f = fixture((path, input) => {
		if (path !== "/rpc/pages/list") return defaultReply(path);
		return (input as { cursor?: string }).cursor === undefined
			? { items: [summary], nextCursor: "CURSOR" }
			: { items: [{ ...summary, ref: "TRL/pages/second" }], nextCursor: null };
	});
	expect(
		await run(
			["page", "list", "--project", "TRL", "--q", "forecast", "--comment", "open", "--pinned", "--all"],
			f.deps,
		),
	).toBe(0);
	expect(f.calls[0]!.input).toEqual({ project: "TRL", q: "forecast", comment: "open", pinned: true, limit: 200 });
	expect(f.calls[1]!.input).toMatchObject({ cursor: "CURSOR" });
	expect(JSON.parse(f.text()).map((page: { ref: string }) => page.ref)).toEqual([
		"TRL/pages/forecast",
		"TRL/pages/second",
	]);
});

test("show reads one version and versions lists the history", async () => {
	const f = fixture();
	expect(await run(["page", "show", "TRL/pages/forecast", "--version", "2", "--include-deleted"], f.deps)).toBe(0);
	expect(f.calls[0]).toMatchObject({
		path: "/rpc/pages/get",
		input: { page: "TRL/pages/forecast", version: 2, includeDeleted: true },
	});
	const versions = fixture();
	expect(await run(["page", "versions", "TRL/pages/forecast", "--limit", "5"], versions.deps)).toBe(0);
	expect(versions.calls[0]).toMatchObject({
		path: "/rpc/pages/versions",
		input: { page: "TRL/pages/forecast", limit: 5 },
	});
});

test("pull writes the document and every asset under the directory the caller names", async () => {
	const out = mkdtempSync(join(tmpdir(), "trellis-page-out-"));
	try {
		const f = fixture((path) =>
			path === "/rpc/pages/pull"
				? { page: summary, version, assets: [{ path: "media/logo one.svg" }, { path: "style.css" }] }
				: defaultReply(path),
		);
		expect(await run(["page", "pull", "TRL/pages/forecast", "--out", out], f.deps)).toBe(0);
		expect(f.calls.map((call) => call.path)).toEqual([
			"/rpc/pages/pull",
			"/rpc/pages/createRenderLease",
			"/api/page-render/LEASE/index.html",
			"/api/page-render/LEASE/media/logo%20one.svg",
			"/api/page-render/LEASE/style.css",
		]);
		expect(readFileSync(join(out, "index.html"), "utf8")).toBe("bytes of /api/page-render/LEASE/index.html");
		expect(readFileSync(join(out, "media/logo one.svg"), "utf8")).toBe(
			"bytes of /api/page-render/LEASE/media/logo%20one.svg",
		);
		expect(readFileSync(join(out, "style.css"), "utf8")).toBe("bytes of /api/page-render/LEASE/style.css");
		expect(JSON.parse(f.text())).toMatchObject({ files: ["index.html", "media/logo one.svg", "style.css"] });
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
});

test("rename keeps the address and sends the revision the caller read", async () => {
	const f = fixture();
	expect(await run(["page", "rename", "TRL/pages/forecast", "Next forecast", "--expected-version", "3"], f.deps)).toBe(
		0,
	);
	expect(f.calls[0]).toEqual({
		path: "/rpc/pages/update",
		input: { page: "TRL/pages/forecast", title: "Next forecast", expectedVersion: 3 },
		files: [],
	});
});

test("pin and unpin send the state of the pin", async () => {
	const f = fixture();
	expect(await run(["page", "pin", "TRL/pages/forecast"], f.deps)).toBe(0);
	expect(await run(["page", "unpin", "TRL/pages/forecast"], f.deps)).toBe(0);
	expect(f.calls.map((call) => call.input)).toEqual([
		{ page: "TRL/pages/forecast", pinned: true },
		{ page: "TRL/pages/forecast", pinned: false },
	]);
});

test("rm needs the confirmation and restore takes the same revision", async () => {
	const refused = fixture();
	expect(await run(["page", "rm", "TRL/pages/forecast", "--expected-version", "3"], refused.deps)).toBe(2);
	expect(refused.errors()).toContain("rm needs --yes");
	expect(refused.calls).toEqual([]);

	const f = fixture();
	expect(await run(["page", "rm", "TRL/pages/forecast", "--expected-version", "3", "--yes", "--force"], f.deps)).toBe(
		0,
	);
	expect(await run(["page", "restore", "TRL/pages/forecast", "--expected-version", "4", "--force"], f.deps)).toBe(0);
	expect(f.calls.map((call) => ({ path: call.path, input: call.input }))).toEqual([
		{ path: "/rpc/pages/delete", input: { page: "TRL/pages/forecast", expectedVersion: 3, force: true } },
		{ path: "/rpc/pages/restore", input: { page: "TRL/pages/forecast", expectedVersion: 4, force: true } },
	]);
});

test("a stale revision prints the revision the page holds now", async () => {
	const f = fixture();
	f.deps.fetch = async () =>
		Response.json(
			{
				json: {
					defined: true,
					code: "PAGE_VERSION_CONFLICT",
					status: 412,
					message: "The page changed since the revision you sent.",
					data: { current: { ...summary, revision: 7 } },
				},
			},
			{ status: 412, headers: { "x-trellis-api-version": "1" } },
		);
	expect(await run(["page", "rename", "TRL/pages/forecast", "Next", "--expected-version", "3"], f.deps)).toBe(4);
	expect(f.errors()).toContain("The current revision is 7.");
});

test("every page command prints its own usage and makes no request", async () => {
	for (const command of ["page publish", "page list", "page pull", "page rm", "page restore"]) {
		const f = fixture();
		expect(await run([...command.split(" "), "--help"], f.deps)).toBe(0);
		expect(f.text()).toContain(`trellis ${command}`);
		expect(f.calls).toHaveLength(0);
	}
});
