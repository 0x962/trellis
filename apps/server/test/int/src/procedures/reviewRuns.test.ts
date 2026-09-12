import { afterAll, beforeAll, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app";
import { assertStatusInvariant } from "../../../invariants";

let app: TestApp;
let server: ReturnType<typeof Bun.serve>;
const previous = process.env.TRELLIS_REVIEW_EXECUTOR_URL;
const requests: { path: string; body: unknown }[] = [];
const pr = "https://github.com/owner/repo/pull/1";
beforeAll(async () => {
	server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		async fetch(request) {
			const path = new URL(request.url).pathname;
			requests.push({ path, body: request.method === "POST" ? await request.json() : null });
			if (path.endsWith("/runs"))
				return Response.json({
					runs: [
						{ runId: "one", target: pr },
						{ runId: "two", target: "https://github.com/other/repo/pull/2" },
					],
				});
			if (path.endsWith("/one"))
				return Response.json({ runId: "one", target: pr, nodes: [{ id: "check", status: "waiting" }] });
			if (path.endsWith("/two")) return Response.json({ runId: "two", target: "https://github.com/other/repo/pull/2" });
			return Response.json({ ok: true });
		},
	});
	process.env.TRELLIS_REVIEW_EXECUTOR_URL = `http://127.0.0.1:${server.port}`;
	app = await createTestApp();
});
afterAll(async () => {
	await app.serverTx(assertStatusInvariant);
	await app.close();
	server.stop(true);
	if (previous === undefined) delete process.env.TRELLIS_REVIEW_EXECUTOR_URL;
	else process.env.TRELLIS_REVIEW_EXECUTOR_URL = previous;
});
test("the executor adapter filters runs and refuses actions on another PR", async () => {
	const list = await app.api("/api/reviews/runs", { method: "POST", body: { pr, action: "list" } });
	expect(list.body.runs).toHaveLength(1);
	const answer = await app.api("/api/reviews/runs", {
		method: "POST",
		body: { pr, action: "answer", runId: "one", nodeId: "check", approve: true, note: "Continue" },
	});
	expect(answer.status).toBe(200);
	expect(requests.at(-1)).toEqual({
		path: "/api/graphs/review/runs/one/answer",
		body: { nodeId: "check", approve: true, note: "Continue" },
	});
	const denied = await app.api("/api/reviews/runs", { method: "POST", body: { pr, action: "resume", runId: "two" } });
	expect(denied.status).toBe(400);
	expect(requests.some((request) => request.path.endsWith("/two/resume"))).toBe(false);
});
test("embedded Margin paths redirect to native review pages", async () => {
	const response = await app.app.request(`/https://github.com/owner/repo/pull/1`);
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toBe("/reviews/owner/repo/1");
});
