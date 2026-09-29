import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	DurableAuthorityFixture,
	deliveryAuthority,
	launchProvenance,
	nativeLifecycleFixture,
} from "../../fixtures/nativeHost";
import { TakeoverProcessFixture } from "../../fixtures/nativeHost/takeoverProcessFixture.ts";

test("F21 kills takeover writers and preserves the original native attempt across competing processes", async () => {
	const fixture = await nativeLifecycleFixture();
	const supervisor = new TakeoverProcessFixture(fixture.ctx.home);
	try {
		const claim = (await fixture.claim())!;
		await fixture.launch(claim);
		await fixture.reconcile();
		const original = await fixture.processes.inspect(claim.attempt.id);
		const provenance = launchProvenance(
			claim.attempt.id,
			claim.run.id,
			fixture.execution.id,
			claim.bridge.stepId,
			claim.bridge.request,
		);
		const provenanceBytes = JSON.stringify(provenance);
		const directory = join(fixture.ctx.home, "process-authority");
		const authority = await DurableAuthorityFixture.create(
			directory,
			deliveryAuthority(fixture.execution.id),
			provenance,
		);
		const at = "2026-09-29T10:05:00.000Z";
		const initial = await supervisor.start({
			directory,
			action: "hold",
			ownerId: "owner-one",
			capabilityId: "capability-one",
			at,
		});
		const ready = await supervisor.wait(initial, ["authorized"]);
		expect(ready.pid).not.toBe(original.pid);
		await expect(supervisor.revoke(authority, initial, original, at)).rejects.toThrow("owner_exit_unknown");
		expect((await authority.trace()).revocations).toHaveLength(0);
		await fixture.processes.complete(claim.attempt.id, "result-across-owner-death", "Completed before takeover");
		const pending = (await fixture.processes.inspect(claim.attempt.id)).result;
		expect((await fixture.tasks()).rows[0]).toMatchObject({ result_id: null });
		expect(await supervisor.kill(initial)).toBe(137);
		const revoked = await supervisor.revoke(authority, initial, await fixture.processes.inspect(claim.attempt.id), at);
		const request = (
			ownerId: string,
			expected = { ownerId: "owner-one", engineEpoch: 1, ownershipRevision: 1 },
			receipts = revoked,
		) => ({
			requestId: crypto.randomUUID(),
			expectedOwnerId: expected.ownerId,
			expectedEpoch: expected.engineEpoch,
			expectedRevision: expected.ownershipRevision,
			newOwnerId: ownerId,
			capabilityId: `capability-${ownerId}`,
			...receipts,
			transferId: crypto.randomUUID(),
			committedAt: at,
			expiresAt: "2026-09-29T10:20:00.000Z",
		});
		const candidate = async (ownerId: string, release?: string) =>
			supervisor.start({
				directory,
				action: "takeover",
				ownerId,
				capabilityId: `capability-${ownerId}`,
				at,
				release,
				request: request(ownerId),
			});
		const before = await candidate("owner-before");
		expect(await supervisor.wait(before, ["before_commit"])).toMatchObject({ sequence: 4 });
		expect(await supervisor.kill(before)).toBe(137);
		expect((await DurableAuthorityFixture.open(directory).trace()).takeovers).toHaveLength(0);
		expect((await authority.current()).engineEpoch).toBe(1);

		const release = join(fixture.ctx.home, "release-takeover");
		const contenders = await Promise.all([candidate("owner-two", release), candidate("owner-three", release)]);
		for (const contender of contenders)
			expect(await supervisor.wait(contender, ["before_commit"])).toMatchObject({ sequence: 4 });
		await writeFile(release, "commit", { mode: 0o600 });
		const results = await Promise.all(
			contenders.map((contender) => supervisor.wait(contender, ["after_commit", "rejected"])),
		);
		expect(results.map((result) => result.state).sort()).toEqual(["after_commit", "rejected"]);
		const winner = contenders[results.findIndex((result) => result.state === "after_commit")]!;
		const loser = contenders[results.findIndex((result) => result.state === "rejected")]!;
		expect(await loser.child.exited).toBe(0);
		expect(await supervisor.kill(winner)).toBe(137);
		const inspector = await supervisor.start({
			directory,
			action: "inspect",
			ownerId: "inspector",
			capabilityId: "none",
			at,
		});
		const inspected = await supervisor.wait(inspector, ["inspected"]);
		expect(await inspector.child.exited).toBe(0);
		expect(inspected.trace).toMatchObject({ sequence: 4, authority: { engineEpoch: 2, ownerId: winner.ownerId } });
		expect(inspected.trace!.takeovers).toHaveLength(1);
		expect(JSON.stringify(inspected.trace!.provenance)).toBe(provenanceBytes);
		expect((await fixture.processes.inspect(claim.attempt.id)).pid).toBe(original.pid);

		const winnerState = await authority.current();
		const winnerRevocation = await supervisor.revoke(
			authority,
			winner,
			await fixture.processes.inspect(claim.attempt.id),
			at,
		);
		const replacementRequest = request("owner-four", winnerState, winnerRevocation);
		const replacement = await supervisor.start({
			directory,
			action: "takeover",
			ownerId: "owner-four",
			capabilityId: replacementRequest.capabilityId,
			at,
			release,
			request: replacementRequest,
		});
		expect(await supervisor.wait(replacement, ["after_commit"])).toMatchObject({ sequence: 7 });
		const stale = await supervisor.start({
			directory,
			action: "authorize",
			ownerId: initial.ownerId,
			capabilityId: initial.capabilityId,
			permission: "native.reserve",
			at,
		});
		expect(await supervisor.wait(stale, ["rejected"])).toMatchObject({ reason: "stale_owner" });
		expect(await stale.child.exited).toBe(0);

		expect((await fixture.processes.inspect(claim.attempt.id)).result).toEqual(pending);
		expect((await fixture.tasks()).rows[0]).toMatchObject({ result_id: null });
		const current = await supervisor.start({
			directory,
			action: "authorize",
			ownerId: replacement.ownerId,
			capabilityId: replacement.capabilityId,
			at,
		});
		expect(await supervisor.wait(current, ["authorized"])).toMatchObject({ state: "authorized" });
		expect(await current.child.exited).toBe(0);
		await fixture.reconcile();
		await fixture.reconcile();
		expect((await fixture.tasks()).rows).toHaveLength(1);
		expect((await fixture.tasks()).rows[0]).toMatchObject({
			attempt_id: claim.attempt.id,
			result_id: "result-across-owner-death",
		});
		expect(fixture.processes.launches).toEqual([claim.attempt.id]);
		expect((await fixture.processes.inspect(claim.attempt.id)).pid).toBe(original.pid);
		expect(JSON.stringify(await authority.provenance())).toBe(provenanceBytes);
		expect((await authority.current()).engineEpoch).toBe(3);
		expect((await fixture.read()).state.status).toBe("succeeded");
		console.log(
			JSON.stringify({
				probe: "F21-processes",
				nativePid: original.pid,
				attemptId: claim.attempt.id,
				reservation: claim.bridge.stepId,
				contenders: results,
				recovered: inspected.trace,
				final: await authority.trace(),
			}),
		);
	} finally {
		const exits = await supervisor.close();
		const cleanup = await fixture.close();
		console.log(
			JSON.stringify({
				probe: "F21-processes-cleanup",
				authority: supervisor.records,
				exits,
				native: cleanup,
				home: fixture.ctx.home,
				directoryRemoved: !existsSync(fixture.ctx.home),
			}),
		);
	}
}, 60_000);
