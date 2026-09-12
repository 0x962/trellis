import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { createGhRunner } from "../../../../src/gh/run.ts";
import { checkRun, graphqlReply } from "../../../fixtures";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { type GhStubHandle, ghStub, type StubReply } from "../../../helpers/gh-stub.ts";

// The pull request procedures over /api against the gh stub: an idempotent
// link, the URL check, the list, the unlink, the refresh, the diff with its
// 1 MB cap, and GH_UNAVAILABLE when gh is not on disk.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
});
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(async () => {
	await t.close();
	for (const restore of restores.splice(0)) restore();
});

const url = "https://github.com/acme/web/pull/12";

const reply = () =>
	graphqlReply([{ number: 12, title: "Add the board", url, checks: [checkRun("test", "SUCCESS", "ci")] }]);

// A test app whose gh runner is the stub with `replies`.
const appWithGh = async (replies: Record<string, StubReply>) => {
	const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-prs-")), replies);
	restores.push(handle.restore);
	t = await createTestApp({ db: h, gh: createGhRunner() });
	await t.seedProject("CDE");
	await t.createTicket({ project: "CDE", title: "First" });
	return handle;
};

const link = (prUrl = url) => t.api("/api/tickets/CDE-1/prs", { method: "POST", body: { url: prUrl } });

// Starts `call`, waits until the gh stub logs its spawn, and returns the
// time in ms a ticket list takes while that gh process still runs.
const readDuringGh = async (handle: GhStubHandle, call: () => Promise<unknown>) => {
	const pending = call();
	while (handle.spawns().length === 0) await Bun.sleep(10);
	const started = performance.now();
	const list = await t.api("/api/tickets?limit=5");
	const ms = performance.now() - started;
	expect(list.status).toBe(200);
	await pending;
	return ms;
};

describe("gh outside the transaction", () => {
	test("a ticket read completes while a slow gh call of a link runs", async () => {
		const handle = await appWithGh({ "api graphql": { ...reply(), delayMs: 2000 } });

		const ms = await readDuringGh(handle, () => link());

		expect(ms).toBeLessThan(1000);
		expect((await t.api("/api/tickets/CDE-1/prs")).body).toHaveLength(1);
	});

	test("a ticket read completes while a slow gh call of a refresh runs", async () => {
		const handle = await appWithGh({ "api graphql": reply() });
		const linked = await link();
		handle.reply("api graphql", { ...reply(), delayMs: 2000 });
		const before = handle.spawns().length;
		const refresh = () => t.api(`/api/prs/${linked.body.id}/refresh`, { method: "POST" });

		const pending = refresh();
		while (handle.spawns().length === before) await Bun.sleep(10);
		const started = performance.now();
		const list = await t.api("/api/tickets?limit=5");
		const ms = performance.now() - started;
		await pending;

		expect(list.status).toBe(200);
		expect(ms).toBeLessThan(1000);
	});
});

describe("pullRequests", () => {
	test("pullRequests.link is idempotent", async () => {
		await appWithGh({ "api graphql": reply() });

		const first = await link();
		const second = await link();

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(first.body).toMatchObject({
			owner: "acme",
			repo: "web",
			number: 12,
			title: "Add the board",
			source: "manual",
		});
		expect(second.body).toEqual(first.body);
		expect((await t.api("/api/tickets/CDE-1/prs")).body).toHaveLength(1);
	});

	test("a URL that is not a pull request answers INVALID_PR_URL", async () => {
		await appWithGh({ "api graphql": reply() });

		const response = await link("https://example.com/nope");

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("INVALID_PR_URL");
	});

	test("the pull request routes answer with the documented shapes", async () => {
		const big = "+".repeat(1024 * 1024 + 1);
		const stub = await appWithGh({ "api graphql": reply(), "pr diff": { stdout: big, stderr: "", exitCode: 0 } });
		const linked = await link();
		const id = linked.body.id as string;

		const list = await t.api("/api/tickets/CDE-1/prs");
		const refreshed = await t.api(`/api/prs/${id}/refresh`, { method: "POST" });
		const diff = await t.api(`/api/prs/${id}/diff`);
		const unlinked = await t.app.request(`http://trellis.test/api/tickets/CDE-1/prs/${id}`, {
			method: "DELETE",
			headers: { "x-trellis-actor": "human:dana" },
		});

		expect(list.status).toBe(200);
		expect(list.body).toHaveLength(1);
		expect(list.body[0]).toMatchObject({
			id,
			url,
			state: "open",
			ciState: "pass",
			linkedBy: { name: "dana", kind: "human" },
		});
		expect(list.body[0].checks).toEqual([{ name: "test", workflow: "ci", bucket: "pass", link: expect.any(String) }]);
		expect(refreshed.status).toBe(200);
		expect(refreshed.body).toMatchObject({ id, number: 12, ciState: "pass" });
		expect(refreshed.body.fetchedAt).toMatch(/^\d{4}-/);
		expect(diff.status).toBe(200);
		expect(diff.body.truncated).toBe(true);
		expect(diff.body.url).toBe(url);
		expect(diff.body.diff.length).toBeLessThanOrEqual(1024 * 1024);
		expect(unlinked.status).toBe(200);
		expect(await unlinked.json()).toEqual({ deleted: id });
		expect((await t.api("/api/tickets/CDE-1/prs")).body).toEqual([]);
		expect(stub.spawns().map((spawn) => spawn.args.slice(0, 2).join(" "))).toContain("pr diff");
	});

	test("a refresh without gh answers GH_UNAVAILABLE", async () => {
		await appWithGh({ "api graphql": reply() });
		const linked = await link();
		process.env.TRELLIS_GH_BIN = join(process.env.TRELLIS_HOME!, "no-such-gh");
		t.runtime.gh = createGhRunner();

		const response = await t.api(`/api/prs/${linked.body.id}/refresh`, { method: "POST" });

		expect(response.status).toBe(503);
		expect(response.body.code).toBe("GH_UNAVAILABLE");
		expect(response.body.data).toEqual({ reason: "missing" });
	});
});
