import { afterEach, beforeEach, expect, test } from "bun:test";
import type { FlowDocumentSaveV1Input } from "@trellis/api";
import { eq } from "drizzle-orm";
import { readDocumentRevision, readDocumentSaveReceipt } from "../../../db/queries/langflowDocuments";
import { flows } from "../../../db/tables/flows.ts";
import { resolveFlow } from "../../flows/flows.ts";
import { assertLegacy } from "../assertLegacy";
import { flowId, saveInput, seedLangflowDocument, serviceFixture } from "../fixture";
import { get } from "../get";
import { legacyServices } from "../legacyServices";
import { save } from "./save.ts";

let h: Awaited<ReturnType<typeof serviceFixture>>;
beforeEach(async () => {
	h = await serviceFixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

const legacyInput = (): FlowDocumentSaveV1Input => ({
	...saveInput(),
	engine: "legacy",
	componentManifestHash: null,
	graphDocument: {
		nodes: [
			{
				id: "00000000000000000000000003",
				parentId: null,
				kind: "agent",
				title: "Review",
				instruction: " Keep these bytes.\r\nβ ",
				parallel: false,
				minutes: null,
				maxRounds: null,
				harness: null,
				x: 0,
				y: 0,
				width: null,
				height: null,
			},
		],
		edges: [],
	},
});
const stored = (revision: number) => h.run((tx) => readDocumentRevision(tx, { flowId, revision }));
const document = () => h.run((tx) => get(h.ctx, tx, { flow: flowId }));

test("an unconverted legacy flow rejects Langflow without creating a revision or receipt", async () => {
	const before = await document();
	const input = saveInput();
	await expect(h.run((tx) => save(h.ctx, tx, input))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["engine"] }] },
	});
	expect(await document()).toEqual(before);
	expect(await stored(1)).toBeUndefined();
	expect(await stored(2)).toBeUndefined();
	expect(await h.run((tx) => readDocumentSaveReceipt(tx, { flowId, requestId: input.requestId }))).toBeUndefined();
	expect((await h.run((tx) => legacyServices.get(h.ctx, tx, { flow: flowId }))).flow.version).toBe(1);
	await h.run((tx) => assertLegacy(h.ctx, tx, { flowId, operation: "read" }));
});

test("a refused transition preserves retained bytes, replay, and usable legacy edits", async () => {
	const input = legacyInput();
	const receipt = await h.run((tx) => save(h.ctx, tx, input));
	const retained = await stored(2);
	const graph = await h.run((tx) => legacyServices.get(h.ctx, tx, { flow: flowId }));
	await expect(h.run((tx) => save(h.ctx, tx, saveInput(2)))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(await stored(2)).toEqual(retained);
	expect(await stored(3)).toBeUndefined();
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(receipt);
	expect(await h.run((tx) => legacyServices.get(h.ctx, tx, { flow: flowId }))).toEqual(graph);
	await h.run((tx) => assertLegacy(h.ctx, tx, { flowId, operation: "read" }));
	await h.run((tx) =>
		legacyServices.save(h.ctx, tx, { flow: flowId, expectedVersion: 2, nodes: graph.nodes, edges: graph.edges }),
	);
	expect((await document()).revision).toBe(3);
});

test("same-engine Langflow drafts remain valid while a reverse transition preserves source bytes", async () => {
	await h.run(async (tx) => seedLangflowDocument(tx, { flow: await resolveFlow(tx, flowId), savedAt: h.ctx.now }));
	const original = await stored(1);
	await expect(h.run((tx) => save(h.ctx, tx, legacyInput()))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect(await stored(1)).toEqual(original);
	const input = saveInput();
	input.graphDocument = { nodes: [], edges: [], draft: " exact\r\nβ " };
	const saved = await h.run((tx) => save(h.ctx, tx, input));
	expect(saved.graphDocument).toEqual(input.graphDocument);
	expect(saved.revision).toBe(2);
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(saved);
	expect(await stored(1)).toEqual(original);
});

test("a stale version conflicts before the engine check", async () => {
	await h.run((tx) => legacyServices.update(h.ctx, tx, { flow: flowId, expectedVersion: 1, name: "Changed" }));
	await expect(h.run((tx) => save(h.ctx, tx, saveInput()))).rejects.toMatchObject({
		code: "FLOW_VERSION_CONFLICT",
		data: { version: 2 },
	});
});

test("an original receipt replays after an explicit persisted engine transition", async () => {
	const input = legacyInput();
	const receipt = await h.run((tx) => save(h.ctx, tx, input));
	await h.run(async (tx) => {
		await tx.update(flows).set({ version: 3 }).where(eq(flows.id, flowId));
		await seedLangflowDocument(tx, { flow: await resolveFlow(tx, flowId), savedAt: h.ctx.now });
	});
	expect((await document()).engine).toBe("langflow");
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(receipt);
	expect((await document()).revision).toBe(3);
});
