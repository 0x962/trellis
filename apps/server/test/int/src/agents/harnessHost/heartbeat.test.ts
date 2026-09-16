import { afterEach, beforeEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
beforeEach(async () => {
	fixture = await harnessHostFixture();
});
afterEach(async () => {
	const exited = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await fixture.client.shutdown();
	await exited;
	await rm(fixture.home, { recursive: true, force: true });
});

test.each(["claude", "codex", "pi", "opencode"] as const)(
	"%s skips a heartbeat when the observed idle turn changes",
	async (harness) => {
		const { host, client, home } = fixture;
		await host.start({ id: "attempt", harness, cwd: home, prompt: "initial", token: "secret" });
		const idle = await host.waitFor("attempt", (state) => state.activity?.state === "idle");
		const expected = {
			turnId: idle.agent!.turnId,
			activityAt: idle.activity!.updatedAt,
			idleBefore: new Date(Date.now() + 1000).toISOString(),
		};
		await client.observe("attempt", "secret", { kind: "working", turnId: "new-turn" });
		await expect(host.send("attempt", "heartbeat", "heartbeat", expected)).rejects.toMatchObject({
			code: "RUNTIME_TURN_CHANGED",
		});
		expect((await host.status("attempt")).acknowledgedMessageIds).not.toContain("heartbeat");
	},
);
