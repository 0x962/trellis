import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

let home: string, daemon: ChildProcess, client: RuntimeClient, host: HarnessHost;
beforeEach(async () => {
	({ home, client, daemon, host } = await harnessHostFixture());
});
afterEach(async () => {
	await client.shutdown();
	await new Promise<void>((done) => daemon.once("exit", () => done()));
	await rm(home, { recursive: true, force: true });
});

test.each(["claude", "codex", "pi", "opencode"] as const)(
	"%s resumes a prepared attempt after the host exits before process launch",
	async (harness) => {
		await host.prepare(
			{ id: "prepared", harness, cwd: home, prompt: "restart notice", model: "saved-model" },
			`provider-${harness}`,
		);
		const replacement = new HarnessHost({
			runtime: client,
			directory: join(home, "attempts"),
			env: { PATH: "/nonexistent" },
			bun: "/nonexistent/bun",
			observationTimeoutMs: 1500,
		});
		const result = await replacement.startPrepared("prepared");
		expect(result.process.agent?.sessionId).toBe(`provider-${harness}`);
		expect(result.process.agent?.model).toBe("saved-model");
		expect(result.process.acknowledgedMessageIds).toContain("prepared");
		expect((await client.list()).filter((p) => p.id === "prepared")).toHaveLength(1);
		await host.stop("prepared");
	},
);

test("OpenCode resumes its prepared prompt after process launch and keeps the process deadline", async () => {
	const descriptor = await host.prepare(
		{ id: "prepared", harness: "opencode", cwd: home, prompt: "restart notice", timeoutMs: 60000 },
		"provider-opencode",
	);
	await client.start({ ...descriptor.spec, timeoutMs: 59000 });
	const waiting = await host.waitFor("prepared", (state) => state.agent?.sessionId === "provider-opencode");
	expect(waiting.acknowledgedMessageIds).not.toContain("prepared");
	const result = await host.startPrepared("prepared");
	expect(result.process.pid).toBe(waiting.pid);
	expect(result.process.acknowledgedMessageIds).toContain("prepared");
	expect((await client.list()).filter((p) => p.id === "prepared")).toHaveLength(1);
	await host.stop("prepared");
});
