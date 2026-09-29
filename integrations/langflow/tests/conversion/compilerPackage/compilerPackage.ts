import { readFile } from "node:fs/promises";
import type { FlowDoc } from "@trellis/api";
import type { ConversionCompilerInput } from "../../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../../apps/server/src/services/langflowMigration/sourceDigest";

export const compilerPackage = async (doc: FlowDoc): Promise<ConversionCompilerInput> => {
	const catalogBytes = await readFile(process.env.TRELLIS_CONVERSION_CATALOG!);
	const frontendTemplateBytes = await readFile(process.env.TRELLIS_CONVERSION_TEMPLATES!);
	const engine = JSON.parse(catalogBytes.toString("utf8")).engine;
	const templates = JSON.parse(frontendTemplateBytes.toString("utf8"));
	return {
		catalogBytes, frontendTemplateBytes, componentManifestHash: sourceDigest(catalogBytes),
		enginePackageDigest: process.env.TRELLIS_CONVERSION_PACKAGE_DIGEST!,
		engineCommit: engine.commit, engineOverlayHash: templates.engineOverlayHash,
		nativePolicies: Object.fromEntries(doc.nodes.filter((node) => node.kind !== "group" && node.kind !== "human" && node.reviewArea == null).map((node) => {
			const sourceHarness = node.harness ?? doc.flow.harness;
			return [node.id, { sourceHarness, harness: {
				preset: sourceHarness?.preset ?? "codex", model: sourceHarness?.model ?? "openai/gpt-6-astra",
				effort: sourceHarness?.effort ?? "high", startCommand: "fixture-start {{prompt}}", resumeCommand: "fixture-resume {{resumeText}}",
			} }];
		})),
	};
};
