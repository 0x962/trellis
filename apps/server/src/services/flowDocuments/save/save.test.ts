import { afterEach, beforeEach, expect, test } from "bun:test";
import { FlowDocumentV1Schema } from "@trellis/api";
import { create } from "../../flows/flows.ts";
import { documentBytes } from "../documentBytes";
import { flowId, saveInput, serviceFixture } from "../fixture";
import { get } from "../get";
import { legacyServices } from "../legacyServices";
import { save } from "./save.ts";

const { get: getLegacy, update, save: saveLegacy } = legacyServices;

let h: Awaited<ReturnType<typeof serviceFixture>>;
beforeEach(async () => {
	h = await serviceFixture();
});
afterEach(async () => {
	await h.db.$client.close();
});

test("a metadata edit rejects an older graph save", async () => {
	await h.run((tx) => update(h.ctx, tx, { flow: flowId, expectedVersion: 1, name: "New name" }));
	await expect(h.run((tx) => save(h.ctx, tx, saveInput()))).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
	const document = await h.run((tx) => get(h.ctx, tx, { flow: flowId }));
	expect(document.flow.name).toBe("New name");
	expect(document.revision).toBe(2);
	expect(FlowDocumentV1Schema.safeParse(document).success).toBe(true);
});

test("a graph save rejects an older metadata edit and preserves the saved graph", async () => {
	const input = saveInput();
	await h.run((tx) => save(h.ctx, tx, input));
	await expect(
		h.run((tx) => update(h.ctx, tx, { flow: flowId, expectedVersion: 1, name: "Lost edit" })),
	).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
	const document = await h.run((tx) => get(h.ctx, tx, { flow: flowId }));
	expect(document.graphDocument).toEqual(input.graphDocument);
});

test("a lost response replays the original receipt after metadata advances", async () => {
	const input = saveInput();
	const first = await h.run((tx) => save(h.ctx, tx, input));
	await h.run((tx) => update(h.ctx, tx, { flow: flowId, expectedVersion: 2, name: "Later name" }));
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(first);
	const current = await h.run((tx) => get(h.ctx, tx, { flow: flowId }));
	expect(current.revision).toBe(3);
	expect(current.flow.name).toBe("Later name");
	expect(current.graphDocument).toEqual(first.graphDocument);
	expect(current.publication).toEqual({ state: "pending", revision: 3 });
});

test("changed request content conflicts while JSON key order preserves receipt identity", async () => {
	const input = saveInput();
	const first = await h.run((tx) => save(h.ctx, tx, input));
	const reordered = Object.fromEntries(Object.entries(input).reverse()) as typeof input;
	expect(await h.run((tx) => save(h.ctx, tx, reordered))).toEqual(first);
	await expect(h.run((tx) => save(h.ctx, tx, { ...input, expectedVersion: 2 }))).rejects.toMatchObject({
		code: "FLOW_REQUEST_CONFLICT",
	});
});

test("two saves of the same revision commit one request", async () => {
	const outcomes = await Promise.allSettled([
		h.run((tx) => save(h.ctx, tx, saveInput())),
		h.run((tx) => save(h.ctx, tx, saveInput())),
	]);
	expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
	expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(1);
	expect((await h.run((tx) => get(h.ctx, tx, { flow: flowId }))).revision).toBe(2);
});

test("legacy graph reads and writes refuse Langflow without a lossy projection", async () => {
	await h.run((tx) => save(h.ctx, tx, saveInput()));
	await expect(h.run((tx) => getLegacy(h.ctx, tx, { flow: flowId }))).rejects.toMatchObject({
		code: "FLOW_UNSUPPORTED_FORMAT",
		data: { operation: "read" },
	});
	await expect(h.run((tx) => saveLegacy(h.ctx, tx, { flow: flowId, nodes: [], edges: [] }))).rejects.toMatchObject({
		code: "FLOW_UNSUPPORTED_FORMAT",
		data: { operation: "write" },
	});
	expect((await h.run((tx) => get(h.ctx, tx, { flow: flowId }))).revision).toBe(2);
});

test("legacy V1 saves retain legacy endpoints and replay without a second version", async () => {
	const input = {
		...saveInput(),
		engine: "legacy" as const,
		componentManifestHash: null,
		graphDocument: { nodes: [], edges: [] },
	};
	const saved = await h.run((tx) => save(h.ctx, tx, input));
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(saved);
	expect((await h.run((tx) => getLegacy(h.ctx, tx, { flow: flowId }))).flow.version).toBe(2);
	await h.run((tx) => saveLegacy(h.ctx, tx, { flow: flowId, expectedVersion: 2, nodes: [], edges: [] }));
	expect((await h.run((tx) => get(h.ctx, tx, { flow: flowId }))).revision).toBe(3);
});

test("save preserves graph counts, text, and geometry beyond the dense fixture", async () => {
	const input = {
		...saveInput(),
		engine: "langflow" as const,
		componentManifestHash: "c".repeat(64),
		graphDocument: {
			nodes: Array.from({ length: 501 }, (_, id) => ({ id, x: 1e8, instruction: "x".repeat(10001) })),
			edges: Array.from({ length: 2001 }, (_, id) => ({ id })),
			rounds: 51,
		},
	};
	const saved = await h.run((tx) => save(h.ctx, tx, input));
	expect(saved.graphDocument).toEqual(input.graphDocument);
	expect(documentBytes({ text: " a\r\nβ " })).not.toEqual(documentBytes({ text: "a\nβ" }));
});

test("a save receipt survives a slug rename and reassignment", async () => {
	const input = { ...saveInput(), flow: "review" };
	const first = await h.run((tx) => save(h.ctx, tx, input));
	await h.run((tx) => update(h.ctx, tx, { flow: flowId, expectedVersion: 2, slug: "renamed" }));
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(first);
	await expect(h.run((tx) => save(h.ctx, tx, { ...input, expectedVersion: 3 }))).rejects.toMatchObject({
		code: "FLOW_REQUEST_CONFLICT",
	});
	const other = await h.run((tx) => create(h.ctx, tx, { name: "Other", slug: "review" }));
	expect(await h.run((tx) => save(h.ctx, tx, input))).toEqual(first);
	expect((await h.run((tx) => get(h.ctx, tx, { flow: other.id }))).revision).toBe(1);
	expect((await h.run((tx) => get(h.ctx, tx, { flow: flowId }))).revision).toBe(3);
});

test("different flow references retain independent request IDs", async () => {
	const input = { ...saveInput(), flow: "review" };
	const first = await h.run((tx) => save(h.ctx, tx, input));
	const other = await h.run((tx) => create(h.ctx, tx, { name: "Other", slug: "other" }));
	const next = await h.run((tx) => save(h.ctx, tx, { ...input, flow: "other" }));
	expect(next.flow.id).toBe(other.id);
	expect(first.flow.id).toBe(flowId);
});
