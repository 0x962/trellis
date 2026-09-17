import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resumeRestartPlan } from "../../../../src/resumeRestartPlan/resumeRestartPlan.ts";

let home: string;
let requests: { body: unknown; authorization: string | null; path: string }[];
let status: number;
let server: ReturnType<typeof Bun.serve>;
const plan = {
	version: 1,
	id: "restart",
	sourceReleaseId: "old",
	targetReleaseId: "next",
	createdAt: "now",
	sessions: [],
};
beforeEach(async () => {
	home = await mkdtemp("/tmp/trl-resume-");
	requests = [];
	status = 200;
	server = Bun.serve({
		port: 0,
		fetch: async (request) => {
			requests.push({
				body: await request.json(),
				authorization: request.headers.get("authorization"),
				path: new URL(request.url).pathname,
			});
			if (status !== 200) return new Response("Resume failed", { status });
			await rm(join(home, "restart-plan.json"));
			return Response.json({ resumed: 1, skipped: 0 });
		},
	});
});
afterEach(async () => {
	server.stop(true);
	await rm(home, { recursive: true, force: true });
});
const resume = () => resumeRestartPlan(home, { origin: server.url.origin, token: "desktop-token", pid: process.pid });
test("an unchanged package without a pending plan sends no request", async () => {
	await resume();
	expect(requests).toEqual([]);
});
test("the authenticated host consumes a pending plan once", async () => {
	await writeFile(join(home, "restart-plan.json"), JSON.stringify(plan));
	await resume();
	await resume();
	expect(requests).toEqual([
		{
			body: { restartId: "restart", wait: false },
			authorization: "Bearer desktop-token",
			path: "/api/native-work/restart/resume",
		},
	]);
});
test("a failed resume retains the plan for the next app launch", async () => {
	await writeFile(join(home, "restart-plan.json"), JSON.stringify(plan));
	status = 500;
	await expect(resume()).rejects.toThrow("Resume failed");
	expect(JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"))).toEqual(plan);
	expect(requests).toHaveLength(1);
});
