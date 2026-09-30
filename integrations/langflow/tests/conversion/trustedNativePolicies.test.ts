import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { documentBytes } from "../../../../apps/server/src/services/flowDocuments";
import {
	createTrustedConversionProducer,
	inspectConversionGraph,
	type NativePolicyConfigurationV1,
	NativePolicyConfigurationV1Schema,
	ResolvedConversionHarnessSchema,
	readTrustedNativePolicies,
} from "../../../../apps/server/src/services/langflowMigration";
import { sourceDigest } from "../../../../apps/server/src/services/langflowMigration/sourceDigest";
import { fixtureDocument, fixtureId } from "./fixture";

const seal = (value: unknown) => {
	const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
	return { bytes, sha256: sourceDigest(bytes) };
};

const fixture = () => {
	const doc = fixtureDocument();
	const sourceBytes = documentBytes(doc);
	const packageIdentity = {
		enginePackageDigest: "a".repeat(64),
		componentManifestHash: "b".repeat(64),
		engineOverlayHash: "c".repeat(64),
	};
	const record: NativePolicyConfigurationV1 = {
		schemaVersion: 1,
		source: { flowId: doc.flow.id, version: doc.flow.version, sha256: sourceDigest(sourceBytes) },
		packageIdentity,
		nativePolicies: Object.fromEntries(
			doc.nodes.map((node) => [
				node.id,
				{
					sourceHarness: null,
					harness: {
						preset: "codex",
						startCommand: " fixture-start {{prompt}}\n",
						resumeCommand: " fixture-resume {{resumeText}}\n",
						model: "openai/gpt-6-astra",
						effort: "high",
					},
				},
			]),
		),
	};
	return { doc, sourceBytes, packageIdentity, record };
};

test("returns exact explicit policies and retained configuration bytes", () => {
	const input = fixture();
	const configuration = seal(input.record);
	const original = Buffer.from(configuration.bytes);
	const result = readTrustedNativePolicies({ ...input, configuration });
	expect(result.state).toBe("ready");
	if (result.state !== "ready") throw new Error("ready expected");
	expect(result.nativePolicies).toEqual(input.record.nativePolicies);
	expect(result.configuration!.bytes).toEqual(original);
	expect(result.configuration!.sha256).toBe(sourceDigest(original));
	configuration.bytes.fill(0);
	expect(result.configuration!.bytes).toEqual(original);
	expect(result.source).toEqual(input.record.source);
});

test("missing configuration and missing node policies preserve the compiler blocker", () => {
	const input = fixture();
	delete input.record.nativePolicies[fixtureId(1)];
	for (const configuration of [null, seal(input.record)]) {
		const result = readTrustedNativePolicies({ ...input, configuration });
		expect(result.state).toBe("blocked");
		if (result.state === "blocked") expect(result.diagnostics[0]!.code).toBe("conversion_native_policy_unresolved");
	}
});

test("configuration digest comes from an independent trusted value", () => {
	const input = fixture();
	const configuration = seal(input.record);
	configuration.bytes = Buffer.concat([configuration.bytes, Buffer.from(" ")]);
	const result = readTrustedNativePolicies({ ...input, configuration });
	expect(result.state).toBe("blocked");
	if (result.state === "blocked") expect(result.diagnostics[0]!.code).toBe("conversion_native_policy_digest_conflict");
});

test("source identity and exact bytes must match even after a configuration is resealed", () => {
	for (const key of ["flowId", "version", "sha256"] as const) {
		const input = fixture();
		if (key === "flowId") input.record.source.flowId = fixtureId(999);
		if (key === "version") input.record.source.version += 1;
		if (key === "sha256") input.record.source.sha256 = "d".repeat(64);
		const result = readTrustedNativePolicies({ ...input, configuration: seal(input.record) });
		expect(result.state).toBe("blocked");
		if (result.state === "blocked")
			expect(result.diagnostics[0]!.code).toBe("conversion_native_policy_source_conflict");
	}
	const input = fixture();
	const result = readTrustedNativePolicies({
		...input,
		sourceBytes: Buffer.from(JSON.stringify(input.doc, null, 2)),
		configuration: seal(input.record),
	});
	expect(result.state).toBe("blocked");
});

test("each selected package identity must match", () => {
	for (const key of ["enginePackageDigest", "componentManifestHash", "engineOverlayHash"] as const) {
		const input = fixture();
		const configuration = seal(input.record);
		const packageIdentity = { ...input.packageIdentity, [key]: "d".repeat(64) };
		const result = readTrustedNativePolicies({ ...input, packageIdentity, configuration });
		expect(result.state).toBe("blocked");
		if (result.state === "blocked")
			expect(result.diagnostics[0]!.code).toBe("conversion_native_policy_package_conflict");
	}
});

test("source harness strings stay exact and cannot authorize a different resolved value", () => {
	const input = fixture();
	const inherited = { preset: "codex" as const, model: "openai/gpt-6-astra" };
	input.doc.flow.harness = inherited;
	input.sourceBytes = documentBytes(input.doc);
	input.record.source.sha256 = sourceDigest(input.sourceBytes);
	for (const policy of Object.values(input.record.nativePolicies)) {
		policy.sourceHarness = inherited;
		policy.harness.model = inherited.model;
	}
	const result = readTrustedNativePolicies({ ...input, configuration: seal(input.record) });
	expect(result.state).toBe("ready");
	if (result.state === "ready") expect(result.nativePolicies[fixtureId(1)]!.sourceHarness).toEqual(inherited);
	input.record.nativePolicies[fixtureId(1)]!.sourceHarness = null;
	const changed = readTrustedNativePolicies({ ...input, configuration: seal(input.record) });
	expect(changed.state).toBe("blocked");
	if (changed.state === "blocked") expect(changed.diagnostics[0]!.code).toBe("conversion_native_policy_unresolved");
});

test("configuration validation preserves source model whitespace without resolving it", () => {
	const input = fixture();
	const inherited = { preset: "codex" as const, model: " openai/gpt-6-astra " };
	input.record.nativePolicies[fixtureId(1)]!.sourceHarness = inherited;
	const parsed = NativePolicyConfigurationV1Schema.parse(input.record);
	expect(parsed.nativePolicies[fixtureId(1)]!.sourceHarness).toEqual(inherited);
});

test("Muse keeps effort absent while selectable effort remains explicit", () => {
	const input = fixture();
	input.doc.flow.harness = { preset: "muse", model: "meta/muse-spark-1.3" };
	input.sourceBytes = documentBytes(input.doc);
	input.record.source.sha256 = sourceDigest(input.sourceBytes);
	for (const policy of Object.values(input.record.nativePolicies)) {
		policy.sourceHarness = input.doc.flow.harness;
		policy.harness.preset = "muse";
		policy.harness.model = "meta/muse-spark-1.3";
		delete policy.harness.effort;
	}
	const result = readTrustedNativePolicies({ ...input, configuration: seal(input.record) });
	expect(result.state).toBe("ready");
	if (result.state === "ready") {
		expect(Object.hasOwn(result.nativePolicies[fixtureId(1)]!.harness, "effort")).toBe(false);
	}
	input.record.nativePolicies[fixtureId(1)]!.harness.effort = "high";
	expect(readTrustedNativePolicies({ ...input, configuration: seal(input.record) }).state).toBe("blocked");
	const codex = fixture().record.nativePolicies[fixtureId(1)]!.harness;
	delete codex.effort;
	expect(ResolvedConversionHarnessSchema.safeParse(codex).success).toBe(false);
});

test("explicit custom commands preserve absent model and effort", () => {
	const input = fixture();
	for (const policy of Object.values(input.record.nativePolicies)) {
		policy.harness = { preset: "custom", startCommand: "explicit start", resumeCommand: "explicit resume" };
	}
	const result = readTrustedNativePolicies({ ...input, configuration: seal(input.record) });
	expect(result.state).toBe("ready");
	if (result.state === "ready") {
		expect(result.nativePolicies[fixtureId(1)]!.harness).toEqual(input.record.nativePolicies[fixtureId(1)]!.harness);
	}
});

test("conversion inspection accepts absent Muse effort and retains execution blockers", async () => {
	const input = fixture();
	const node = input.doc.nodes[0]!;
	input.doc.nodes = [node];
	input.doc.flow.harness = { preset: "muse", model: "meta/muse-spark-1.3" };
	const spec = {
		nodeId: node.id,
		taskKeyBase: node.id,
		name: node.title,
		instruction: node.instruction,
		harness: {
			preset: "muse",
			model: "meta/muse-spark-1.3",
			startCommand: "explicit start",
			resumeCommand: "explicit resume",
		},
	};
	const result = inspectConversionGraph({
		sourceBytes: documentBytes(input.doc),
		catalogBytes: await readFile(new URL("../../components/catalog/manifest.v1.json", import.meta.url)),
		expansion: {
			graphDocument: {
				nodes: [{ id: node.id, data: { id: node.id, type: "TrellisNativeAgentV1" } }],
				edges: [],
				trellisRequestSpecsV1: { [node.id]: spec },
			},
			nodeSpecs: [
				{
					sourceNodeId: node.id,
					engineNodeId: node.id,
					definitionId: "native-agent-v1",
					phase: "step",
					specNamespace: "trellisRequestSpecsV1",
				},
			],
		},
	});
	expect(result.graphDocument).not.toBeNull();
	expect(result.diagnostics.map((item) => item.code)).not.toContain("conversion_harness_policy_unverified");
	expect(result.diagnostics.map((item) => item.code)).toContain("conversion_execution_unverified");
});

test("omitted model or effort and account or graph fields cannot supply trusted policies", () => {
	for (const field of ["model", "effort", "accountId", "graphDocument"]) {
		const input = fixture();
		const record = JSON.parse(JSON.stringify(input.record));
		if (field === "model" || field === "effort") delete record.nativePolicies[fixtureId(1)].harness[field];
		if (field === "accountId") record.nativePolicies[fixtureId(1)].accountId = fixtureId(999);
		if (field === "graphDocument") record.graphDocument = { nativePolicies: record.nativePolicies };
		const result = readTrustedNativePolicies({ ...input, configuration: seal(record) });
		expect(result.state).toBe("blocked");
	}
});

test("policies identify only native nodes while human-only sources need no policy", () => {
	const input = fixture();
	input.record.nativePolicies[fixtureId(999)] = input.record.nativePolicies[fixtureId(1)]!;
	const result = readTrustedNativePolicies({ ...input, configuration: seal(input.record) });
	expect(result.state).toBe("blocked");
	if (result.state === "blocked") expect(result.diagnostics[0]!.code).toBe("conversion_native_policy_node_conflict");
	for (const node of input.doc.nodes) node.kind = "human";
	const human = readTrustedNativePolicies({ ...input, sourceBytes: documentBytes(input.doc), configuration: null });
	expect(human.state).toBe("ready");
	if (human.state === "ready") expect(human.nativePolicies).toEqual({});
});

test("the concrete wrapper binds compile and regeneration to their own effective bytes", async () => {
	const input = fixture();
	const catalogBytes = await readFile(new URL("../../components/catalog/manifest.v1.json", import.meta.url));
	input.packageIdentity.componentManifestHash = sourceDigest(catalogBytes);
	const configuration = seal(input.record);
	const producer = createTrustedConversionProducer(
		{
			...input.packageIdentity,
			catalogBytes,
			frontendTemplateBytes: null,
			engineCommit: JSON.parse(catalogBytes.toString("utf8")).engine.commit,
			configuration,
		},
		async () => [],
	);
	configuration.bytes.fill(0);
	const compiled = await producer.compile({ sourceBytes: input.sourceBytes });
	expect(compiled.state).toBe("blocked");
	if (compiled.state === "blocked") {
		expect(compiled.diagnostics.map((item) => item.code)).toContain("conversion_frontend_templates_unavailable");
	}
	input.doc.nodes[0]!.instruction = "An edited instruction";
	const regenerated = await producer.regenerate({
		editedSourceBytes: documentBytes(input.doc),
		previousGraphDocument: {},
	});
	expect(regenerated.state).toBe("blocked");
	if (regenerated.state === "blocked") {
		expect(regenerated.diagnostics[0]!.code).toBe("conversion_native_policy_source_conflict");
	}
});
