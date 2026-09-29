import { expect, test } from "bun:test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { supervisorFixture } from "../fixtures/supervisorFixture";
import { manifest } from "../fixtures/manifest";
import { LangflowSupervisor } from "./supervisor";

test("one supervisor owns the home and revokes before a clean stop", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	try {
		const live = await supervisor.start();
		await expect(fixture.open()).rejects.toThrow("uses");
		const secret = join(fixture.home, "langflow", "secrets", `${live.identity.instanceId}.token`);
		expect((await stat(secret)).mode & 0o777).toBe(0o600);
		expect((await stat(join(fixture.home, "langflow", "data"))).mode & 0o777).toBe(0o700);
		await supervisor.shutdown();
		expect(fixture.trace.slice(-4)).toEqual(["observe", "revoke", "stop", "observe"]);
		expect(fixture.processes.get(live.identity.instanceId)?.state).toBe("exited");
		await expect(supervisor.start()).rejects.toThrow("closed");
	} finally {
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("a restart retains private data and replaces the exact previous process", async () => {
	const fixture = await supervisorFixture();
	const first = await fixture.open();
	const live = await first.start();
	const data = join(fixture.home, "langflow", "data", "receipt.json");
	await writeFile(data, '{"deadlineAt":"2026-09-29T10:15:00.000Z","receiptId":"original"}');
	await first.shutdown();
	const second = await fixture.open();
	try {
		const replacement = await second.start();
		expect(replacement.identity.ownerId).not.toBe(live.identity.ownerId);
		expect(await readFile(data, "utf8")).toBe('{"deadlineAt":"2026-09-29T10:15:00.000Z","receiptId":"original"}');
		expect([...fixture.processes.values()].filter((process) => process.state === "running")).toHaveLength(1);
	} finally {
		await second.shutdown();
		await fixture.remove();
	}
});

test("a stale observation cannot renew or publish", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	await supervisor.start();
	fixture.observeChallenge("old-observation");
	try {
		await expect(supervisor.withHealthyEngine(async () => "published")).rejects.toThrow("observation_mismatch");
		await expect(
			supervisor.renew({
				executionId: "execution-1",
				requestId: crypto.randomUUID(),
				expectedRevision: 1,
				expiresAt: "2026-09-29T11:00:00.000Z",
			}),
		).rejects.toThrow("observation_mismatch");
		expect(fixture.receipts.size).toBe(0);
	} finally {
		fixture.observeChallenge(null);
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("health loss blocks writes while an unknown process prevents replacement", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	const live = await supervisor.start();
	const process = fixture.processes.get(live.identity.instanceId)!;
	try {
		process.health = "unhealthy";
		await expect(supervisor.withHealthyEngine(async () => "published")).rejects.toThrow("unhealthy");
		process.state = "unknown";
		await expect(supervisor.shutdown()).rejects.toThrow("ownership_unknown");
		await expect(fixture.open()).rejects.toThrow("uses");
		expect(fixture.trace.filter((entry) => entry === "start")).toHaveLength(1);
	} finally {
		process.state = "running";
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("a direct macOS or unverified package cannot acquire the home", async () => {
	const fixture = await supervisorFixture();
	try {
		for (const candidate of [
			{ ...manifest, qualification: "candidate" },
			{ ...manifest, target: { kind: "darwin", architecture: "arm64", minimumVersion: "26" } },
		]) {
			await expect(
				LangflowSupervisor.open({
					home: fixture.home,
					hostId: "host-1",
					manifest: candidate,
					dependencies: fixture.dependencies,
				}),
			).rejects.toThrow("not_approved");
		}
	} finally {
		await fixture.remove();
	}
});
