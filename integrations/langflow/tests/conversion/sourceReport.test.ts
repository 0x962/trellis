import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkMigrationSource,
	inspectSource,
	prepareMigration,
} from "../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../apps/server/src/services/langflowMigration/sourceDigest";
import { fixtureDocument, fixtureId, fixtureNode } from "./fixture";

let directory: string;
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-conversion-test-"));
});
afterEach(async () => {
	await rm(directory, { recursive: true });
});

const prepare = (bytes: Uint8Array) =>
	prepareMigration({
		exportDirectory: directory,
		sourceBytes: bytes,
		targetEngineVersion: "fixture-engine",
	});

test("retains exact bytes, private modes, every field, prompt bytes, and independent roots", async () => {
	const doc = fixtureDocument();
	const bytes = Buffer.from(`${JSON.stringify(doc, null, 3)}\r\n`);
	const record = await prepare(bytes);
	expect(await readFile(record.sourceExportRef)).toEqual(bytes);
	expect(record.sourceDocumentHash).toBe(sourceDigest(bytes));
	expect((await stat(record.sourceExportRef)).mode & 0o777).toBe(0o600);
	const reportPath = join(directory, record.migrationId, "report.json");
	expect((await stat(join(directory, record.migrationId))).mode & 0o777).toBe(0o700);
	expect((await stat(reportPath)).mode & 0o777).toBe(0o600);
	expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(record);
	expect(record.sourceManifest!.entryNodeIds).toEqual(doc.nodes.map((node) => node.id));
	expect(Object.keys(record.sourceManifest!.flow.fields)).toEqual(Object.keys(doc.flow));
	for (const [index, node] of doc.nodes.entries()) {
		expect(record.sourceManifest!.nodes[index]!.order).toBe(index);
		expect(Object.keys(record.sourceManifest!.nodes[index]!.fields)).toEqual(Object.keys(node));
		expect(record.instructionHashes[node.id]).toBe(sourceDigest(node.instruction));
	}
	expect(record.state).toBe("blocked");
	expect(record.targetDocumentHash).toBeNull();
	expect(record.nodeMap).toEqual({});
	expect(record.edgeMap).toEqual({});
});

test("blocks an empty graph and reports each unavailable node and edge mapping", async () => {
	const doc = fixtureDocument();
	doc.nodes[0]!.kind = "gate";
	doc.edges = [{ id: fixtureId(3), fromNodeId: fixtureId(1), toNodeId: fixtureId(2), branch: "no" }];
	const record = await prepare(Buffer.from(JSON.stringify(doc)));
	expect(record.sourceManifest!.entryNodeIds).toEqual([fixtureId(1)]);
	expect(record.diagnostics.filter((item) => item.code === "unsupported_node_mapping")).toHaveLength(2);
	expect(record.diagnostics.filter((item) => item.code === "unsupported_edge_mapping")).toHaveLength(1);
	doc.nodes = [];
	doc.edges = [];
	const empty = await prepare(Buffer.from(JSON.stringify(doc)));
	expect(empty.state).toBe("blocked");
	expect(empty.diagnostics.map((item) => item.code)).toEqual(["production_catalog_unavailable"]);
});

test("retains unknown fields and reports each omission without schema stripping", async () => {
	const doc = fixtureDocument();
	const source = {
		...doc,
		future: true,
		nodes: doc.nodes.map((node) => ({ ...node, newSetting: { arbitrary: "retained" } })),
	};
	const bytes = Buffer.from(JSON.stringify(source));
	const record = await prepare(bytes);
	expect(
		record.diagnostics.filter((item) => item.code === "unsupported_source_field").map((item) => item.path),
	).toEqual([["nodes", 0, "newSetting"], ["nodes", 1, "newSetting"], ["future"]]);
	expect(record.sourceManifest).toBeNull();
	expect(await readFile(record.sourceExportRef)).toEqual(bytes);
});

test("retains unsupported node kinds and malformed sources before refusal", async () => {
	const doc = fixtureDocument();
	const source = { ...doc, nodes: [{ ...doc.nodes[0], kind: "future-kind" }] };
	const record = await prepare(Buffer.from(JSON.stringify(source)));
	expect(record.diagnostics.some((item) => item.code === "unsupported_source_value")).toBe(true);
	await expect(prepare(Buffer.from("{"))).rejects.toThrow();
	const folders = await readdir(directory);
	const other = folders.find((folder) => folder !== record.migrationId)!;
	expect(await readFile(join(directory, other, "source.json"), "utf8")).toBe("{");
});

test("preserves nested groups, loops, explicit deadlines, inherited defaults, Jev, and all branches", () => {
	const doc = fixtureDocument();
	doc.nodes = [
		fixtureNode(1, { kind: "group", minutes: 10001, width: 1e8, height: 1e8 }),
		fixtureNode(2, { kind: "loop", parentId: fixtureId(1), maxRounds: 51 }),
		fixtureNode(3, { kind: "gate", parentId: fixtureId(2), reviewArea: "frontend" }),
		fixtureNode(4, { kind: "human", parentId: fixtureId(2) }),
		fixtureNode(5, {
			parentId: fixtureId(2),
			harness: { preset: "codex", model: "openai/gpt-6-astra", effort: "xhigh" },
		}),
		fixtureNode(6, { parentId: fixtureId(2) }),
	];
	doc.edges = [
		{ id: fixtureId(7), fromNodeId: fixtureId(3), toNodeId: fixtureId(4), branch: "no" },
		{ id: fixtureId(8), fromNodeId: fixtureId(3), toNodeId: fixtureId(5), branch: "yes" },
		{ id: fixtureId(9), fromNodeId: fixtureId(5), toNodeId: fixtureId(6), branch: "out" },
	];
	const result = inspectSource(doc);
	expect(result.diagnostics).toEqual([]);
	expect(result.manifest!.nodes).toHaveLength(6);
	expect(result.manifest!.edges).toHaveLength(3);
	expect(result.manifest!.nodes[0]!.fields.minutes).toBe(sourceDigest("10001"));
	expect(result.manifest!.nodes[1]!.fields.maxRounds).toBe(sourceDigest("51"));
	expect(result.manifest!.nodes[3]!.fields.harness).toBe(sourceDigest("null"));
});

test("retains every row beyond dense fixture sizes and text cutoffs", async () => {
	const doc = fixtureDocument();
	doc.flow.briefing = "x".repeat(100001);
	doc.nodes = Array.from({ length: 502 }, (_, index) => fixtureNode(index + 1, { x: 1e9, y: -1e9 }));
	doc.nodes[0]!.instruction = "x".repeat(100001);
	doc.edges = Array.from({ length: 2001 }, (_, index) => ({
		id: fixtureId(1000 + index),
		fromNodeId: fixtureId(Math.floor(index / 5) + 1),
		toNodeId: fixtureId(Math.floor(index / 5) + 2 + (index % 5)),
		branch: "out" as const,
	}));
	const record = await prepare(Buffer.from(JSON.stringify(doc)));
	expect(record.sourceManifest!.nodes).toHaveLength(502);
	expect(record.sourceManifest!.edges).toHaveLength(2001);
	expect(record.sourceManifest!.briefingHash).toBe(sourceDigest(doc.flow.briefing));
	expect(record.instructionHashes[fixtureId(1)]).toBe(sourceDigest(doc.nodes[0]!.instruction));
	expect(record.diagnostics).toHaveLength(2504);
});

test("source equality does not approve conversion and any changed identity, version, or bytes invalidates review", async () => {
	const doc = fixtureDocument();
	const bytes = Buffer.from(JSON.stringify(doc));
	const record = await prepare(bytes);
	const current = { flowId: doc.flow.id, version: doc.flow.version, sourceBytes: bytes };
	expect(await checkMigrationSource(record, current)).toEqual([]);
	expect(record.state).toBe("blocked");
	for (const changed of [
		{ ...current, flowId: fixtureId(99) },
		{ ...current, version: 72 },
		{ ...current, sourceBytes: Buffer.concat([bytes, Buffer.from("\n")]) },
	]) {
		expect((await checkMigrationSource(record, changed)).map((item) => item.code)).toEqual(["source_changed"]);
	}
	await writeFile(record.sourceExportRef, "changed");
	expect((await checkMigrationSource(record, current)).map((item) => item.code)).toEqual(["source_export_changed"]);
});

test("reports invalid topology and preserves source order in the manifest", () => {
	const doc = fixtureDocument();
	doc.nodes[0]!.parentId = fixtureId(99);
	expect(inspectSource(doc).diagnostics.map((item) => item.code)).toEqual(["source_unknown-parent"]);
	doc.nodes.reverse();
	expect(inspectSource(doc).manifest!.nodes.map((node) => node.id)).toEqual([fixtureId(2), fixtureId(1)]);
});

test("hashes the original flow and node model values before schema transforms", () => {
	const doc = fixtureDocument();
	doc.flow.harness = { preset: "codex", model: " openai/gpt-6-astra " };
	doc.nodes[0]!.harness = { preset: "codex", model: " openai/gpt-6-astra " };
	const original = inspectSource(doc);
	const expected = sourceDigest('{"model":" openai/gpt-6-astra ","preset":"codex"}');
	expect(original.diagnostics).toEqual([]);
	expect(original.manifest!.flow.fields.harness).toBe(expected);
	expect(original.manifest!.nodes[0]!.fields.harness).toBe(expected);
	doc.flow.harness.model = "openai/gpt-6-astra";
	doc.nodes[0]!.harness.model = "openai/gpt-6-astra";
	const trimmed = inspectSource(doc);
	expect(trimmed.manifest!.flow.sha256).not.toBe(original.manifest!.flow.sha256);
	expect(trimmed.manifest!.nodes[0]!.sha256).not.toBe(original.manifest!.nodes[0]!.sha256);
});
