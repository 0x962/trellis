import { expect, test } from "bun:test";
import { chmod, readFile, rename, symlink } from "node:fs/promises";
import { join } from "node:path";
import { supervisorFixture } from "../fixtures/supervisorFixture";

test("engine requests require the exact current bearer and a fresh healthy observation", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	try {
		const live = await supervisor.start();
		const path = join(fixture.home, "langflow", "secrets", `${live.identity.instanceId}.token`);
		const authorization = `Bearer ${await readFile(path, "utf8")}`;
		let calls = 0;
		const operation = async () => ++calls;
		for (const invalid of [null, "Bearer wrong", authorization.toLowerCase(), `${authorization} `]) {
			await expect(supervisor.withAuthenticatedEngine(invalid, operation)).rejects.toThrow("authentication_denied");
		}
		expect(calls).toBe(0);
		expect(await supervisor.withAuthenticatedEngine(authorization, async (current) => current.identity)).toEqual(
			live.identity,
		);
		fixture.observeChallenge("stale");
		await expect(supervisor.withAuthenticatedEngine(authorization, operation)).rejects.toThrow("observation_mismatch");
		fixture.observeChallenge(null);
		fixture.processes.get(live.identity.instanceId)!.health = "unhealthy";
		await expect(supervisor.withAuthenticatedEngine(authorization, operation)).rejects.toThrow("unhealthy");
		expect(calls).toBe(0);
	} finally {
		fixture.observeChallenge(null);
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("a replacement refuses the previous instance bearer", async () => {
	const fixture = await supervisorFixture();
	const first = await fixture.open();
	const previous = await first.start();
	const authorization = `Bearer ${await readFile(
		join(fixture.home, "langflow", "secrets", `${previous.identity.instanceId}.token`),
		"utf8",
	)}`;
	await first.shutdown();
	const second = await fixture.open();
	try {
		await second.start();
		await expect(second.withAuthenticatedEngine(authorization, async () => "accepted")).rejects.toThrow(
			"authentication_denied",
		);
	} finally {
		await second.shutdown();
		await fixture.remove();
	}
});

test("authentication refuses public and linked credential files", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	try {
		const live = await supervisor.start();
		const path = join(fixture.home, "langflow", "secrets", `${live.identity.instanceId}.token`);
		const authorization = `Bearer ${await readFile(path, "utf8")}`;
		await chmod(path, 0o644);
		await expect(supervisor.withAuthenticatedEngine(authorization, async () => "accepted")).rejects.toThrow(
			"unsafe_sidecar_authentication",
		);
		await chmod(path, 0o600);
		await rename(path, `${path}.original`);
		await symlink(`${path}.original`, path);
		await expect(supervisor.withAuthenticatedEngine(authorization, async () => "accepted")).rejects.toThrow();
	} finally {
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("supervisor exclusion spans the authenticated callback and releases after a failure", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	try {
		const live = await supervisor.start();
		const authorization = `Bearer ${await readFile(
			join(fixture.home, "langflow", "secrets", `${live.identity.instanceId}.token`),
			"utf8",
		)}`;
		await expect(
			supervisor.withAuthenticatedEngine(authorization, async () => {
				await expect(supervisor.shutdown()).rejects.toThrow("supervisor_busy");
				await expect(supervisor.withHealthyEngine(async () => null)).rejects.toThrow("supervisor_busy");
				throw new Error("claim_failed");
			}),
		).rejects.toThrow("claim_failed");
		expect(await supervisor.withAuthenticatedEngine(authorization, async () => "accepted")).toBe("accepted");
	} finally {
		await supervisor.shutdown();
		await fixture.remove();
	}
});
