import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
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
	"a prior %s turn failure cannot reject a new message before its receipt",
	async (harness) => {
		const { host, client, home } = fixture;
		await host.start({ id: "attempt", harness, cwd: home, prompt: "initial", token: "secret" });
		await host.waitFor("attempt", (state) => state.activity?.state === "idle");
		await client.observe("attempt", "secret", { kind: "error", error: "Previous turn failed", outcome: "failed" });
		const before = await host.status("attempt");
		const received = await host.send("attempt", "next request", "next");
		expect(received.acknowledgedMessageIds).toContain("next");
		expect(received.agent?.error).toBeNull();
		expect(received.pid).toBe(before.pid);
	},
);

test("a prior turn failure cannot turn uncertain delivery into a rejection", async () => {
	const { host, client, home } = fixture;
	await host.start({ id: "attempt", harness: "opencode", cwd: home, prompt: "initial", token: "secret" });
	await host.waitFor("attempt", (state) => state.activity?.state === "idle");
	await client.observe("attempt", "secret", { kind: "error", error: "Previous turn failed", outcome: "failed" });
	await client.registerNativeDelivery(
		"attempt",
		"secret",
		"uncertain",
		createHash("sha256").update("trellis-message:uncertain\nnext request").digest("hex"),
		true,
	);
	const reconnected = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin") },
		bun: process.execPath,
		observationTimeoutMs: 100,
	});
	await expect(reconnected.send("attempt", "next request", "uncertain")).rejects.toMatchObject({
		code: "HARNESS_OBSERVATION_TIMEOUT",
	});
	expect((await host.status("attempt")).acknowledgedMessageIds).not.toContain("uncertain");
	expect(Buffer.from((await host.output("attempt")).data, "base64").toString()).not.toContain("native prompt accepted");
});
