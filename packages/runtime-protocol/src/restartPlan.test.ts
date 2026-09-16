import { expect, test } from "bun:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type RestartPlan,
	readRestartPlan,
	removeRestartPlan,
	restartPending,
	writeRestartPlan,
} from "./restartPlan.ts";

const plan: RestartPlan = {
	version: 1,
	id: "restart",
	sourceReleaseId: "old",
	targetReleaseId: "new",
	createdAt: "2026-09-15T20:00:00Z",
	sessions: [
		{
			runId: "run",
			previousAttemptId: "old-attempt",
			providerSessionId: "conversation",
			harness: "claude",
			workspace: "/work",
			processIdentity: "process",
			attempt: { id: "new-attempt", token: "secret" },
		},
	],
};

test("restart intent retains session identity and private attempt credentials until complete", async () => {
	const home = await mkdtemp(join(tmpdir(), "restart-plan-"));
	expect(restartPending(home)).toBe(false);
	expect(await readRestartPlan(home)).toBeNull();
	await writeRestartPlan(home, plan);
	expect(restartPending(home)).toBe(true);
	expect(await readRestartPlan(home)).toEqual(plan);
	expect((await stat(join(home, "restart-plan.json"))).mode & 0o777).toBe(0o600);
	await writeRestartPlan(home, { ...plan, sessions: [{ ...plan.sessions[0]!, done: true }] });
	expect((await readRestartPlan(home))?.sessions[0]?.done).toBe(true);
	await removeRestartPlan(home);
	expect(restartPending(home)).toBe(false);
});

test("malformed restart intent fails without discarding saved sessions", async () => {
	const home = await mkdtemp(join(tmpdir(), "restart-plan-"));
	const path = join(home, "restart-plan.json");
	await writeFile(path, "broken");
	await expect(readRestartPlan(home)).rejects.toThrow();
	expect(await readFile(path, "utf8")).toBe("broken");
});
