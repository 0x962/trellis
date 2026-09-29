import { expect, test } from "bun:test";
import type { ConversionEditIntentV1 } from "@trellis/api";
import { act } from "react";
import { mountedDraft } from "../../../../langflowDrafts/documentEffects/fixture";
import { content } from "../../../../langflowDrafts/fixtures/fixtures";

type Mounted = Awaited<ReturnType<typeof mountedDraft>>;
type Lease = Awaited<ReturnType<ReturnType<Mounted["value"]>["beginExplicitEdit"]>>;

function intent(lease: Lease): ConversionEditIntentV1 {
	return {
		schemaVersion: 1,
		flowId: lease.base.flow.id,
		expectedVersion: lease.base.revision,
		expectedDocumentHash: lease.base.documentHash,
		componentManifestHash: lease.base.componentManifestHash,
		enginePackageDigest: "e".repeat(64),
		requestId: crypto.randomUUID(),
		edits: [{ kind: "set-flow-briefing", briefing: "Exact briefing" }],
	};
}

test("captures the final frame draft before the clean-base lease and rechecks resume authority", async () => {
	let authorized = true;
	let resumed = 0;
	const f = await mountedDraft({ canDispatch: () => authorized });
	const frame = {
		suspendEditing: async () => {
			f.value().draftChanged(content("last frame edit"));
			return content("last frame edit");
		},
		resumeEditing: () => {
			resumed++;
			return true;
		},
	};
	try {
		await act(async () => {
			await expect(f.value().beginExplicitEdit(frame)).rejects.toThrow("Resolve the browser draft");
		});
		expect(f.snapshot().draft.contentJson).toBe(JSON.stringify(content("last frame edit")));
		expect(f.snapshot()).toMatchObject({ suspended: true, explicitEdit: false });
		authorized = false;
		expect(f.value().resumeEditing(frame)).toBe(false);
		expect(resumed).toBe(0);
		authorized = true;
		await act(async () => {
			expect(f.value().resumeEditing(frame)).toBe(true);
		});
		expect(resumed).toBe(1);
	} finally {
		await f.close();
	}
});

test("retains the exact pending intent across remount and ignores ordinary draft events", async () => {
	const f = await mountedDraft();
	const frame = { suspendEditing: async () => content("saved"), resumeEditing: () => true };
	try {
		let lease!: Lease;
		await act(async () => {
			lease = await f.value().beginExplicitEdit(frame);
		});
		const request = intent(lease);
		await act(async () => {
			await lease.dispatch(request, async () => ({ state: "pending", requestId: request.requestId }));
		});
		const bytes = f.value().exportDraft();
		await f.edit("ignored after suspension");
		await f.flush();
		expect(f.value().exportDraft()).toBe(bytes);
		expect(f.snapshot().explicitEdit).toBe(true);
		expect(f.value().resumeEditing(frame)).toBe(false);
		await f.detach();
		await f.render();
		await act(async () => {
			lease = await f.value().beginExplicitEdit(null);
		});
		expect(lease.pendingBytes()).toBe(JSON.stringify(request));
		await act(async () => {
			await lease.replay(async (replayed) => {
				expect(JSON.stringify(replayed)).toBe(JSON.stringify(request));
				return { state: "blocked", diagnostics: [] };
			});
			lease.release();
		});
		expect(f.snapshot()).toMatchObject({ suspended: true, explicitEdit: false });
	} finally {
		await f.close();
	}
});

test("a committed explicit edit requires a fresh mount even after read-only state changes", async () => {
	const f = await mountedDraft();
	const frame = { suspendEditing: async () => content("saved"), resumeEditing: () => true };
	try {
		let lease!: Lease;
		await act(async () => {
			lease = await f.value().beginExplicitEdit(frame);
		});
		const request = intent(lease);
		const committed = {
			...lease.base,
			revision: lease.base.revision + 1,
			flow: { ...lease.base.flow, version: lease.base.flow.version + 1 },
		};
		await act(async () => {
			await lease.dispatch(request, async () => ({ requestId: request.requestId, document: committed }));
			lease.acceptCommittedDocument(committed);
		});
		expect(f.value().requiresFreshFrame).toBe(true);
		expect(f.value().resumeEditing(frame)).toBe(false);
		await f.render({ readOnly: true });
		await f.render({ readOnly: false });
		expect(f.value().requiresFreshFrame).toBe(true);
		expect(f.snapshot().suspended).toBe(true);
	} finally {
		await f.close();
	}
});
