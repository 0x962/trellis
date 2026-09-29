import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMigrationSource, prepareMigration } from "../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../apps/server/src/services/langflowMigration/sourceDigest";
import { fixtureDocument, fixtureId, fixtureNode } from "./fixture";

const catalogBytes = await readFile(new URL("../../components/catalog/manifest.v1.json", import.meta.url));
const manifest = JSON.parse(catalogBytes.toString());
let directory: string;
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-conversion-catalog-"));
});
afterEach(async () => {
	await rm(directory, { recursive: true });
});
const prepare = (doc = fixtureDocument(), bytes = catalogBytes) =>
	prepareMigration({
		exportDirectory: directory,
		sourceBytes: Buffer.from(JSON.stringify(doc)),
		catalogBytes: bytes,
		targetEngineVersion: manifest.engine.version,
	});

test("retains exact catalog bytes and reports all seven legacy selectors without executable maps", async () => {
	const doc = fixtureDocument();
	doc.nodes = [
		fixtureNode(1),
		fixtureNode(2, { kind: "gate", reviewArea: null }),
		fixtureNode(3, { kind: "gate", reviewArea: "frontend" }),
		fixtureNode(4, { kind: "human" }),
		fixtureNode(5, { kind: "group", parallel: false }),
		fixtureNode(6, { kind: "group", parallel: true }),
		fixtureNode(7, { kind: "loop", maxRounds: 51 }),
	];
	const record = await prepare(doc);
	expect(record.catalog!.sha256).toBe(sourceDigest(catalogBytes));
	expect(await readFile(record.catalog!.exportRef)).toEqual(catalogBytes);
	expect((await stat(record.catalog!.exportRef)).mode & 0o777).toBe(0o600);
	for (const [index, mapping] of manifest.legacyMappings.entries()) {
		const codes = record.diagnostics.filter((item) => item.path?.[1] === fixtureId(index + 1)).map((item) => item.code);
		expect(codes).toEqual([...mapping.blockerCodes, "unsupported_node_mapping"]);
	}
	expect(record.state).toBe("blocked");
	expect(record.nodeMap).toEqual({});
	expect(record.edgeMap).toEqual({});
	expect(record.targetDocumentHash).toBeNull();
});

test("reports missing field destinations and harness fields without losing their bytes", async () => {
	const catalog = structuredClone(manifest);
	delete catalog.preservation.fieldDestinations.nodes.instruction;
	catalog.preservation.fields.harness = ["preset"];
	const doc = fixtureDocument();
	doc.flow.harness = { preset: "codex", model: " openai/gpt-6-astra " };
	const record = await prepare(doc, Buffer.from(JSON.stringify(catalog)));
	expect(record.diagnostics.filter((item) => item.code === "catalog_field_unmapped").map((item) => item.path)).toEqual([
		["flow", doc.flow.id, "harness", "model"],
		["nodes", fixtureId(1), "instruction"],
		["nodes", fixtureId(2), "instruction"],
	]);
	expect(await readFile(record.sourceExportRef, "utf8")).toBe(JSON.stringify(doc));
});

test("blocks unknown or ambiguous selectors and catalogs that claim unsupported execution", async () => {
	for (const mappings of [[], [manifest.legacyMappings[0], manifest.legacyMappings[0]]]) {
		const catalog = { ...manifest, legacyMappings: mappings };
		const record = await prepare(fixtureDocument(), Buffer.from(JSON.stringify(catalog)));
		expect(record.diagnostics.filter((item) => item.code === "catalog_selector_unresolved")).toHaveLength(2);
	}
	const catalog = structuredClone(manifest);
	catalog.allowedForPublication = true;
	catalog.legacyMappings[0].status = "supported";
	catalog.legacyMappings[0].blockerCodes = [];
	const record = await prepare(fixtureDocument(), Buffer.from(JSON.stringify(catalog)));
	expect(record.diagnostics.filter((item) => item.code === "catalog_mapping_unimplemented")).toHaveLength(2);
	expect(record.state).toBe("blocked");
});

test("invalidates reports when retained or current catalog bytes change or disappear", async () => {
	const doc = fixtureDocument();
	const record = await prepare(doc);
	const current = {
		flowId: doc.flow.id,
		version: doc.flow.version,
		sourceBytes: Buffer.from(JSON.stringify(doc)),
		catalogBytes,
	};
	expect(await checkMigrationSource(record, current)).toEqual([]);
	for (const bytes of [undefined, Buffer.concat([catalogBytes, Buffer.from("\n")])]) {
		expect((await checkMigrationSource(record, { ...current, catalogBytes: bytes })).map((item) => item.code)).toEqual([
			"catalog_changed",
		]);
	}
	await writeFile(record.catalog!.exportRef, "{}");
	expect((await checkMigrationSource(record, current)).map((item) => item.code)).toEqual(["catalog_export_changed"]);
});

test("retains unsupported catalog formats and rejects a mismatched engine", async () => {
	const unknown = await prepare(fixtureDocument(), Buffer.from('{"schemaVersion":2}'));
	expect(unknown.diagnostics[0]!.code).toBe("unsupported_catalog");
	expect(await readFile(unknown.catalog!.exportRef, "utf8")).toBe('{"schemaVersion":2}');
	const mismatch = await prepareMigration({
		exportDirectory: directory,
		sourceBytes: Buffer.from(JSON.stringify(fixtureDocument())),
		catalogBytes,
		targetEngineVersion: "different",
	});
	expect(mismatch.diagnostics.some((item) => item.code === "catalog_engine_mismatch")).toBe(true);
});
