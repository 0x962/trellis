import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlowDocSchema, FlowHarnessSchema } from "@trellis/api";
import { documentBytes } from "../../../../apps/server/src/services/flowDocuments/documentBytes";
import { prepareMigration } from "../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../apps/server/src/services/langflowMigration/sourceDigest";
import baseline from "../semantics/review_v71_manifest.json";

test("retained Review v71 preserves every row, field, instruction, and both independent roots", async () => {
	const runBytes = await readFile(process.env.TRELLIS_REVIEW_V71_RUN!);
	const run = JSON.parse(runBytes.toString("utf8"));
	const doc = FlowDocSchema.parse(run.doc);
	expect(run.id).toBe(baseline.runId);
	expect(doc.flow.id).toBe(baseline.flowId);
	expect(doc.flow.version).toBe(baseline.flowVersion);
	expect(doc.flow.harness).toEqual(FlowHarnessSchema.parse(baseline.harness));
	expect(doc.nodes).toHaveLength(baseline.nodeCount);
	expect(doc.edges).toHaveLength(baseline.edgeCount);
	const projection = {
		flow: Object.fromEntries(["id", "slug", "version", "briefing", "harness"].map((key) => [key, run.doc.flow[key]])),
		nodes: run.doc.nodes,
		edges: run.doc.edges,
		steps: run.state.steps.map((step: Record<string, unknown>) =>
			Object.fromEntries(["nodeId", "output", "decision"].map((key) => [key, step[key] ?? null])),
		),
	};
	expect(sourceDigest(documentBytes(projection))).toBe(baseline.projectionSha256);
	const directory = await mkdtemp(join(tmpdir(), "trellis-conversion-v71-"));
	try {
		const bytes = Buffer.from(JSON.stringify(run.doc));
		const report = await prepareMigration({
			exportDirectory: directory,
			sourceBytes: bytes,
			targetEngineVersion: "1.12.3",
		});
		expect(await readFile(report.sourceExportRef)).toEqual(bytes);
		expect(report.sourceManifest!.briefingHash).toBe(baseline.briefingSha256);
		expect(report.instructionHashes).toEqual(baseline.instructions);
		for (const [rows, manifests] of [
			[doc.nodes, report.sourceManifest!.nodes],
			[doc.edges, report.sourceManifest!.edges],
		] as const) {
			for (const [index, row] of rows.entries()) {
				const manifest = manifests[index]!;
				expect(manifest.id).toBe(row.id);
				expect(manifest.order).toBe(index);
				expect(manifest.sha256).toBe(sourceDigest(documentBytes(row)));
				expect(manifest.fields).toEqual(
					Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sourceDigest(documentBytes(value))])),
				);
			}
		}
		expect(report.sourceManifest!.entryNodeIds).toEqual(["01M2A1JWKFXM3WPADAXCWDWYSV", "01M2A1JWKG5KEM9J367D0BW8CN"]);
		expect(report.diagnostics.filter((item) => item.code.startsWith("source_"))).toEqual([]);
		expect(report.diagnostics.filter((item) => item.code === "unsupported_node_mapping")).toHaveLength(27);
		expect(report.diagnostics.filter((item) => item.code === "unsupported_edge_mapping")).toHaveLength(3);
		expect(report.state).toBe("blocked");
		expect(report.targetDocumentHash).toBeNull();
	} finally {
		await rm(directory, { recursive: true });
	}
});
