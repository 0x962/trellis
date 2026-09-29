import { expect, test } from "bun:test";
import { withAuthorityPermit } from "../fixtures/authorityPermit";
import { supervisorFixture } from "../fixtures/supervisorFixture";
import { readIssuedAuthority } from "./issuedBytes";

test("expiry refuses old commands and live renewal replaces only delivery authority", async () => {
	const fixture = await supervisorFixture();
	const supervisor = await fixture.open();
	const live = await supervisor.start();
	fixture.bind(live.identity);
	const expired = fixture.authority();
	const input = withAuthorityPermit(
		{
			executionId: expired.executionId,
			requestId: crypto.randomUUID(),
			expectedRevision: expired.ownershipRevision,
			expiresAt: "2026-09-29T11:00:00.000Z",
		},
		expired.engineJobId,
	);
	try {
		expect(() => fixture.authorize(expired)).toThrow("denied");
		const receipt = await supervisor.renew(input);
		expect(() => fixture.authorize(receipt.authority)).not.toThrow();
		expect(() => fixture.authorize(expired)).toThrow("denied");
		expect(receipt.authority.engineEpoch).toBe(expired.engineEpoch);
		expect(receipt.authority.ownershipRevision).toBe(expired.ownershipRevision + 1);
		expect(receipt.authority.engineJobId).toBe(expired.engineJobId);
		expect(await supervisor.renew(input)).toEqual(receipt);
		await expect(supervisor.renew({ ...input, expiresAt: "2026-09-29T12:00:00.000Z" })).rejects.toThrow(
			"identity_conflict",
		);
		expect(fixture.receipts.size).toBe(1);
		const saved = fixture.receipts.get(`${input.executionId}/${input.requestId}`)!;
		expect(readIssuedAuthority(saved).authorityBytes).toBe(saved.authorityBytes);
		expect(JSON.parse(saved.authorityBytes)).toEqual(receipt.authority);
		expect(() => readIssuedAuthority({ ...saved, authorityBytes: JSON.stringify(expired) })).toThrow(
			"issued_authority_mismatch",
		);
		fixture.setTime("2026-09-29T11:00:00.000Z");
		expect(() => fixture.authorize(receipt.authority)).toThrow("denied");
	} finally {
		await supervisor.shutdown();
		await fixture.remove();
	}
});

test("takeover requires revocation and retains the job and admission digest", async () => {
	const fixture = await supervisorFixture();
	const first = await fixture.open();
	const live = await first.start();
	fixture.bind(live.identity);
	const original = fixture.authority();
	const admission = (await fixture.dependencies.authority.read(original.executionId)).admission;
	await first.shutdown();
	const replacement = await fixture.open();
	try {
		const newLive = await replacement.start();
		const input = withAuthorityPermit({
			executionId: original.executionId,
			requestId: crypto.randomUUID(),
			expectedOwnerId: original.ownerId,
			expectedEpoch: original.engineEpoch,
			expectedRevision: original.ownershipRevision,
			expiresAt: "2026-09-29T11:00:00.000Z",
		});
		const revocation = fixture.revocations.get(original.ownerId)!;
		fixture.revocations.delete(original.ownerId);
		await expect(replacement.takeover(input)).rejects.toThrow("owner_not_revoked");
		fixture.revocations.set(original.ownerId, revocation);
		const receipt = await replacement.takeover(input);
		expect("transferId" in receipt).toBe(true);
		if (!("transferId" in receipt)) throw new Error("wrong_receipt");
		expect(receipt.authority.ownerId).toBe(newLive.identity.ownerId);
		expect(receipt.authority.engineEpoch).toBe(original.engineEpoch + 1);
		expect(receipt.authority.engineJobId).toBe(original.engineJobId);
		expect(receipt.admission.state).toBe("open");
		if (receipt.admission.state !== "open" || admission.state !== "open") throw new Error("admission_closed");
		expect(receipt.admission.receipt.submissionDigest).toBe(admission.receipt.submissionDigest);
		expect(receipt.admission.receipt.admissionId).not.toBe(admission.receipt.admissionId);
		expect(receipt.admission.receipt.engineEpoch).toBe(receipt.authority.engineEpoch);
		expect(() => fixture.authorize(original)).toThrow("denied");
		expect(await replacement.takeover(input)).toEqual(receipt);
		await expect(replacement.takeover({ ...input, requestId: crypto.randomUUID() })).rejects.toThrow(
			"ownership_conflict",
		);
	} finally {
		await replacement.shutdown();
		await fixture.remove();
	}
});

test("cancellation recovery narrows renewed and transferred authority after expiry", async () => {
	const fixture = await supervisorFixture();
	const first = await fixture.open();
	let replacement: Awaited<ReturnType<typeof fixture.open>> | undefined;
	try {
		const live = await first.start();
		fixture.bind(live.identity);
		const original = fixture.authority();
		const broadInput = withAuthorityPermit({
			executionId: original.executionId,
			requestId: crypto.randomUUID(),
			expectedRevision: original.ownershipRevision,
			expiresAt: "2026-09-29T11:00:00.000Z",
		});
		const broad = await first.renew(broadInput);
		fixture.cancel(false);
		await expect(first.renew(broadInput)).rejects.toThrow("canceled_admission_open");
		fixture.cancel();
		await expect(first.renew(broadInput)).rejects.toThrow("cancellation_requires_successor_authority");
		fixture.setTime("2026-09-29T12:00:00.000Z");
		const closed = (await fixture.dependencies.authority.read(original.executionId)).admission;
		const renewed = await first.renew(
			withAuthorityPermit({
				executionId: original.executionId,
				requestId: crypto.randomUUID(),
				expectedRevision: broad.authority.ownershipRevision,
				expiresAt: "2026-09-29T13:00:00.000Z",
			}, original.engineJobId),
		);
		expect(renewed.authority.permissions).toEqual(["execution.cancel"]);
		expect((await fixture.dependencies.authority.read(original.executionId)).admission).toEqual(closed);
		await first.shutdown();
		fixture.setTime("2026-09-29T14:00:00.000Z");
		replacement = await fixture.open();
		await replacement.start();
		const transferred = await replacement.takeover(
			withAuthorityPermit({
				executionId: original.executionId,
				requestId: crypto.randomUUID(),
				expectedOwnerId: renewed.authority.ownerId,
				expectedEpoch: renewed.authority.engineEpoch,
				expectedRevision: renewed.authority.ownershipRevision,
				expiresAt: "2026-09-29T15:00:00.000Z",
			}, original.engineJobId),
		);
		expect(transferred.authority.permissions).toEqual(["execution.cancel"]);
		if (!("transferId" in transferred)) throw new Error("wrong_receipt");
		expect(transferred.admission).toEqual(closed);
		expect(transferred.authority.engineJobId).toBe(original.engineJobId);
		expect((await fixture.dependencies.authority.read(original.executionId)).canceled).toBe(true);
	} finally {
		await replacement?.shutdown();
		await first.shutdown();
		await fixture.remove();
	}
});
