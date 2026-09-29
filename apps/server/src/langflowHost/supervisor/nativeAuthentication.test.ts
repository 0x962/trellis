import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { supervisorFixture } from "../fixtures/supervisorFixture";
import { PrivateState } from "../privateState";

test("native callbacks require their own current credential and a healthy observation", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	try {
		const live = await supervisor.start();
		const state = await PrivateState.open(fixture.home);
		const credential = await state.nativeReservationAuthentication(live.identity);
		const authorization = `Bearer ${await readFile(credential.nativeReservationAuthenticationFile, "utf8")}`;
		const engineAuthorization = `Bearer ${await readFile(state.authenticationFile(live.identity), "utf8")}`;
		let calls = 0;
		const operation = async () => ++calls;
		for (const invalid of [null, "Bearer wrong", engineAuthorization, `${authorization} `]) {
			await expect(supervisor.withAuthenticatedNativeReservation(invalid, operation)).rejects.toThrow(
				"authentication_denied",
			);
		}
		await expect(supervisor.withAuthenticatedEngine(authorization, operation)).rejects.toThrow("authentication_denied");
		expect(calls).toBe(0);
		expect(await supervisor.withAuthenticatedNativeReservation(authorization, async (current) => current.identity)).toEqual(
			live.identity,
		);
		fixture.processes.get(live.identity.instanceId)!.health = "unhealthy";
		await expect(supervisor.withAuthenticatedNativeReservation(authorization, operation)).rejects.toThrow("unhealthy");
		fixture.processes.get(live.identity.instanceId)!.health = "healthy";
		fixture.observeChallenge("stale");
		await expect(supervisor.withAuthenticatedNativeReservation(authorization, operation)).rejects.toThrow(
			"observation_mismatch",
		);
		expect(calls).toBe(0);
	} finally {
		fixture.observeChallenge(null);
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("native credential rotates with the instance and retains its binding across reopen", async () => {
	const fixture = await supervisorFixture();
	const first = await fixture.open();
	const previous = await first.start();
	const state = await PrivateState.open(fixture.home);
	const original = await state.nativeReservationAuthentication(previous.identity);
	const authorization = `Bearer ${await readFile(original.nativeReservationAuthenticationFile, "utf8")}`;
	await first.shutdown();
	const reopened = await PrivateState.open(fixture.home);
	expect(await reopened.nativeReservationAuthentication(previous.identity)).toEqual(original);
	const second = await fixture.open();
	try {
		const current = await second.start();
		const replacement = await reopened.nativeReservationAuthentication(current.identity);
		expect(replacement.nativeReservationAuthenticationSha256).not.toBe(original.nativeReservationAuthenticationSha256);
		await expect(second.withAuthenticatedNativeReservation(authorization, async () => "accepted")).rejects.toThrow(
			"authentication_denied",
		);
	} finally {
		await second.shutdown();
		await fixture.remove();
	}
});

test("native authentication rejects changed bytes and another retained identity", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	try {
		const live = await supervisor.start();
		const state = await PrivateState.open(fixture.home);
		const credential = await state.nativeReservationAuthentication(live.identity);
		const original = await readFile(credential.nativeReservationAuthenticationFile);
		await writeFile(credential.nativeReservationAuthenticationFile, "changed");
		await expect(
			supervisor.withAuthenticatedNativeReservation("Bearer changed", async () => "accepted"),
		).rejects.toThrow("authentication_digest_conflict");
		await writeFile(credential.nativeReservationAuthenticationFile, original);
		await expect(state.nativeReservationAuthentication({ ...live.identity, ownerId: "foreign" })).rejects.toThrow(
			"native_identity_conflict",
		);
	} finally {
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("native authentication holds supervisor exclusion through the callback", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	try {
		const live = await supervisor.start();
		const path = join(fixture.home, "langflow", "secrets", `${live.identity.instanceId}.native-reservations.token`);
		const authorization = `Bearer ${await readFile(path, "utf8")}`;
		await expect(
			supervisor.withAuthenticatedNativeReservation(authorization, async () => {
				await expect(supervisor.shutdown()).rejects.toThrow("supervisor_busy");
				await expect(supervisor.withHealthyEngine(async () => null)).rejects.toThrow("supervisor_busy");
				throw new Error("claim_failed");
			}),
		).rejects.toThrow("claim_failed");
		expect(await supervisor.withAuthenticatedNativeReservation(authorization, async () => "accepted")).toBe("accepted");
	} finally {
		await supervisor.shutdown();
		await fixture.remove();
	}
});
