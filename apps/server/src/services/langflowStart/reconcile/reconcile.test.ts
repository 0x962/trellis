import { expect, test } from "bun:test";
import { fixture } from "../components/fixture/fixture.ts";
import { reconcile } from "./reconcile.ts";

const run = (f: ReturnType<typeof fixture>) => reconcile(f.context, { executionId: f.initial.executionId }, f);

test("binding and admission each commit before the engine can admit native effects", async () => {
	const f = fixture();
	expect((await run(f)).disposition).toBe("queued");
	expect(f.trace).toEqual([
		"commit",
		"lookup",
		"submit",
		"bind",
		"commit",
		"open",
		"commit",
		"admit",
		"confirmed",
		"commit",
	]);
});

test("unknown correlation never submits another job", async () => {
	const f = fixture();
	f.engine.lookup = async (key) => ({ state: "unknown", key });
	expect((await run(f)).disposition).toBe("unknown");
	expect(f.current().submission.state).toBe("submission_unknown");
	expect(f.current().admission.state).toBe("closed");
	expect(f.trace).not.toContain("submit");
	expect(f.trace).not.toContain("admit");
});

test("a lost response recovers the permanent engine job before admission", async () => {
	const f = fixture();
	const submit = f.engine.submit;
	f.engine.submit = async (input) => {
		await submit(input);
		return { state: "unknown", key: { version: 1, hostId: f.initial.hostId, executionId: f.initial.executionId } };
	};
	expect((await run(f)).disposition).toBe("unknown");
	expect(f.current().admission.state).toBe("closed");
	expect((await run(f)).disposition).toBe("queued");
	expect(f.trace.filter((entry) => entry === "submit")).toHaveLength(1);
});

test("a crash after binding recovers without a second submit or owner grant", async () => {
	const f = fixture();
	const open = f.store.openAdmission;
	f.store.openAdmission = async () => {
		throw new Error("crash");
	};
	await expect(run(f)).rejects.toThrow("crash");
	expect(f.current().correlation).not.toBeNull();
	expect(f.current().admission.state).toBe("closed");
	f.store.openAdmission = open;
	f.authorize = async () => {
		throw new Error("duplicate_authorization");
	};
	expect((await run(f)).disposition).toBe("queued");
	expect(f.trace.filter((entry) => entry === "submit")).toHaveLength(1);
});

test("admitted recovery retains the exact receipt and stored execution", async () => {
	const f = fixture();
	await run(f);
	const before = structuredClone(f.current());
	f.engine.lookup = async () => {
		throw new Error("duplicate_lookup");
	};
	f.engine.submit = async () => {
		throw new Error("duplicate_submit");
	};
	await run(f);
	expect(f.current()).toEqual(before);
	expect(f.trace.filter((entry) => entry === "open")).toHaveLength(1);
});

for (const state of ["pending", "unknown"] as const) {
	test(`an ${state} admission response retains the committed receipt`, async () => {
		const f = fixture();
		f.engine.admit = async () => ({ state });
		expect((await run(f)).disposition).toBe(state);
		const receipt = structuredClone(f.current().admission);
		expect((await run(f)).disposition).toBe(state);
		expect(f.current().admission).toEqual(receipt);
	});
}

test("a foreign correlation receipt cannot bind or open admission", async () => {
	const f = fixture();
	const submit = f.engine.submit;
	f.engine.submit = async (input) => {
		const result = await submit(input);
		if (result.state !== "found") throw new Error("fixture");
		return { ...result, receipt: { ...result.receipt, publicationId: "foreign" } };
	};
	await expect(run(f)).rejects.toThrow("correlation_conflict");
	expect(f.current().correlation).toBeNull();
	expect(f.current().admission.state).toBe("closed");
});

test("an expired owner grant cannot open admission", async () => {
	const f = fixture();
	const authorize = f.authorize;
	f.authorize = async (input) => ({
		...(await authorize(input)),
		issuedAt: "2026-09-29T04:00:00Z",
		expiresAt: "2026-09-29T05:00:00Z",
	});
	await expect(run(f)).rejects.toThrow("authority_conflict");
	expect(f.current().admission.state).toBe("closed");
});

test("cancellation during submission prevents admission", async () => {
	const f = fixture();
	const submit = f.engine.submit;
	f.engine.submit = async (input) => {
		const result = await submit(input);
		f.current().canceled = true;
		return result;
	};
	expect((await run(f)).disposition).toBe("reused");
	expect(f.trace).not.toContain("admit");
});

test("unknown operations log only their identities", async () => {
	for (const operation of ["lookup", "submit", "admit"] as const) {
		const f = fixture();
		const unknown = {
			state: "unknown" as const,
			key: { version: 1 as const, hostId: f.initial.hostId, executionId: f.initial.executionId },
		};
		if (operation === "lookup") f.engine.lookup = async () => unknown;
		if (operation === "submit") f.engine.submit = async () => unknown;
		if (operation === "admit") f.engine.admit = async () => ({ state: "unknown" });
		await reconcile(f.context, { executionId: f.initial.executionId }, f);
		expect(f.logs).toHaveLength(1);
		expect(f.logs[0]!.fields).toEqual({
			operation,
			executionId: f.initial.executionId,
			hostId: f.initial.hostId,
			...(operation === "admit"
				? { engineJobId: "00000000-0000-4000-8000-000000000001", admissionId: "admission-1" }
				: {}),
		});
	}
});

test("a store that leaves admission closed fails before engine delivery", async () => {
	const f = fixture();
	f.store.openAdmission = async () => structuredClone(f.current());
	await expect(reconcile(f.context, { executionId: f.initial.executionId }, f)).rejects.toThrow(
		"admission_not_committed",
	);
	expect(f.trace).not.toContain("admit");
});

test("admission recovery preserves the original authority text", async () => {
	const f = fixture();
	const delivered: string[] = [];
	f.engine.admit = async ({ receipt, authority, authorityBytes }) => {
		expect(authorityBytes).toBe(await f.readAuthorityBytes(authority));
		expect(authorityBytes).not.toBe(JSON.stringify(authority));
		delivered.push(authorityBytes);
		return delivered.length === 1 ? { state: "unknown" } : { state: "admitted", receipt };
	};
	expect((await run(f)).disposition).toBe("unknown");
	f.authorize = async () => {
		throw new Error("duplicate_authorization");
	};
	expect((await run(f)).disposition).toBe("queued");
	expect(delivered[0]).toBe(delivered[1]);
});

test("different authority bytes fail before engine admission", async () => {
	const f = fixture();
	const read = f.readAuthorityBytes;
	f.readAuthorityBytes = async (authority) =>
		JSON.stringify({
			...JSON.parse(await read(authority)),
			capabilityId: "foreign-capability",
		});
	await expect(run(f)).rejects.toThrow("authority_bytes_conflict");
	expect(f.trace).not.toContain("admit");
});

test("missing original authority bytes prevent engine admission", async () => {
	const f = fixture();
	f.readAuthorityBytes = async () => {
		throw new Error("authority_bytes_missing");
	};
	await expect(run(f)).rejects.toThrow("authority_bytes_missing");
	expect(f.trace).not.toContain("admit");
});
