import { afterEach, beforeEach, expect, test } from "bun:test";
import { insertDocumentConversion } from "../../../db/queries/langflowDocuments";
import { flows } from "../../../db/tables/flows.ts";
import { resolveFlow } from "../../flows/flows.ts";
import {
	flowId,
	manifestHash,
	packageDigest,
	publisher,
	saveInput,
	seedLangflowDocument,
	serviceFixture,
} from "../fixture";
import { legacyServices } from "../legacyServices";
import { publishDocument } from "../publishDocument";
import { save } from "../save";
import { discovery } from "./discovery.ts";
import type { DiscoveryAvailability } from "./types.ts";

const unknown: DiscoveryAvailability = { state: "unknown", observedAt: null, reason: "The driver has no observation." };
const available: DiscoveryAvailability = {
	state: "available",
	observedAt: "2026-09-29T08:00:00.000Z",
	enginePackageDigest: packageDigest,
	componentManifestHash: manifestHash,
};
let h: Awaited<ReturnType<typeof serviceFixture>>;
beforeEach(async () => {
	h = await serviceFixture();
});
afterEach(async () => {
	await h.db.$client.close();
});
const read = (availability: DiscoveryAvailability = unknown) => h.run((tx) => discovery(h.ctx, tx, {}, availability));

test("discovery retains dense counts and excludes graph bytes and instructions", async () => {
	await h.run(async (tx) => seedLangflowDocument(tx, { flow: await resolveFlow(tx, flowId), savedAt: h.ctx.now }));
	const input = saveInput();
	input.graphDocument = {
		nodes: Array.from({ length: 501 }, (_, index) => ({ id: `node-${index}`, instruction: "private-node-text" })),
		edges: Array.from({ length: 2001 }, (_, index) => ({ id: `edge-${index}` })),
	};
	await h.run((tx) => save(h.ctx, tx, input));
	const result = await read();
	expect(result.engine).toEqual(unknown);
	expect(result.entries[0]?.flow).toMatchObject({ nodeCount: 501, edgeCount: 2001 });
	expect(result.entries[0]?.capabilities.start.state).toBe("blocked");
	const text = JSON.stringify(result);
	for (const excluded of [
		"graphDocument",
		"sourceBytes",
		"requestBytes",
		"briefing",
		"private-node-text",
		"Read the ticket.",
	])
		expect(text).not.toContain(excluded);
});

test("a publication cannot establish availability or authorize a later saved revision", async () => {
	await h.run(async (tx) => seedLangflowDocument(tx, { flow: await resolveFlow(tx, flowId), savedAt: h.ctx.now }));
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	const publication = await publishDocument(h.io, { flow: flowId, revision: 2 }, publisher());
	expect((await read()).entries[0]?.capabilities.start.state).toBe("unknown");
	expect((await read(available)).entries[0]?.capabilities.start.state).toBe("allowed");
	expect((await read({ ...available, enginePackageDigest: "e".repeat(64) })).entries[0]?.capabilities.start.state).toBe(
		"blocked",
	);
	expect((await read({ ...available, componentManifestHash: "e".repeat(64) })).entries[0]?.compatibility.state).toBe(
		"blocked",
	);
	await h.run((tx) => legacyServices.update(h.ctx, tx, { flow: flowId, expectedVersion: 2, name: "Changed" }));
	const next = (await read(available)).entries[0]!;
	expect(next.revision).toBe(3);
	expect(next.lastExecutablePublication).toEqual(publication);
	expect(next.capabilities.start.state).toBe("blocked");
});

test("a missing actor never receives mutation capabilities", async () => {
	const result = await h.run((tx) => discovery({ ...h.ctx, actor: null }, tx, {}, available));
	for (const capability of Object.values(result.entries[0]!.capabilities)) expect(capability.state).toBe("blocked");
});

test("conversion diagnostics apply only to their saved source version", async () => {
	const sourceBytes = Buffer.from("retained legacy export");
	await h.run((tx) =>
		insertDocumentConversion(tx, {
			migrationId: "00000000000000000000000009",
			flowId,
			sourceVersion: 1,
			sourceBytes,
			createdAt: h.ctx.now,
			provenance: {
				sourceExportRef: "fixture",
				converterVersion: "1",
				targetEngineVersion: "1.12.3",
				targetDocumentHash: null,
				nodeMap: {},
				edgeMap: {},
				instructionHashes: {},
				state: "blocked",
				diagnostics: [
					{ code: "unmapped", message: "The component has no accepted mapping.", severity: "error", path: [] },
				],
			},
		}),
	);
	const blocked = (await read()).entries[0]!;
	expect(blocked.compatibility).toMatchObject({ state: "blocked", diagnostics: [{ code: "unmapped" }] });
	expect(blocked.capabilities.convert.state).toBe("blocked");
	await h.run((tx) => legacyServices.update(h.ctx, tx, { flow: flowId, expectedVersion: 1, name: "New source" }));
	const current = (await read()).entries[0]!;
	expect(current.compatibility).toEqual({ state: "needs_migration", diagnostics: [] });
	expect(current.capabilities.convert.state).toBe("unknown");
});

test("discovery keeps every flow beyond the former item ceiling", async () => {
	await h.db.insert(flows).values(
		Array.from({ length: 501 }, (_, index) => ({
			id: `0000000000000000000000${String(index + 100).padStart(4, "0")}`,
			slug: `flow-${index}`,
			name: `Flow ${index}`,
			createdAt: h.ctx.now,
			updatedAt: h.ctx.now,
		})),
	);
	expect((await read()).entries).toHaveLength(502);
});
