import { isDeepStrictEqual } from "node:util";
import type { FlowDoc } from "@trellis/api";
import { inspectSource } from "../inspectSource";
import { NativePolicyConfigurationV1Schema } from "../nativePolicyConfiguration";
import { sourceDigest } from "../sourceDigest";
import type { TrustedNativePolicyInput, TrustedNativePolicyResult } from "../trustedNativePolicyTypes";

const blocked = (code: string, message: string, path: (string | number)[] = []): TrustedNativePolicyResult => ({
	state: "blocked",
	diagnostics: [{ code, message, path, severity: "error" }],
});

export const readTrustedNativePolicies = (input: TrustedNativePolicyInput): TrustedNativePolicyResult => {
	const sourceBytes = Buffer.from(input.sourceBytes);
	const document: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes));
	const inspection = inspectSource(document);
	if (inspection.manifest === null || inspection.diagnostics.length > 0) {
		return { state: "blocked", diagnostics: inspection.diagnostics };
	}
	const doc = document as FlowDoc;
	const source = { flowId: doc.flow.id, version: doc.flow.version, sha256: sourceDigest(sourceBytes) };
	const packageIdentity = structuredClone(input.packageIdentity);
	const nodes = doc.nodes.filter(
		(node) => (node.kind === "agent" || node.kind === "gate" || node.kind === "loop") && node.reviewArea == null,
	);
	if (input.configuration === null) {
		if (nodes.length === 0) return { state: "ready", nativePolicies: {}, configuration: null, source, packageIdentity };
		return blocked(
			"conversion_native_policy_unresolved",
			"The retained source requires explicit trusted native policies.",
		);
	}
	const bytes = Buffer.from(input.configuration.bytes);
	const sha256 = sourceDigest(bytes);
	if (sha256 !== input.configuration.sha256) {
		return blocked(
			"conversion_native_policy_digest_conflict",
			"The configuration bytes do not match the trusted digest.",
		);
	}
	const parsed = NativePolicyConfigurationV1Schema.safeParse(
		JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
	);
	if (!parsed.success) {
		return blocked(
			"conversion_native_policy_unresolved",
			"The trusted configuration must provide exact source and package bindings and complete native policies.",
		);
	}
	const configuration = parsed.data;
	if (!isDeepStrictEqual(configuration.source, source)) {
		return blocked(
			"conversion_native_policy_source_conflict",
			"The configuration does not identify the exact retained source bytes.",
		);
	}
	if (!isDeepStrictEqual(configuration.packageIdentity, packageIdentity)) {
		return blocked(
			"conversion_native_policy_package_conflict",
			"The configuration does not identify the selected package, catalog, and overlay.",
		);
	}
	const expectedIds = new Set(nodes.map((node) => node.id));
	if (Object.keys(configuration.nativePolicies).some((id) => !expectedIds.has(id))) {
		return blocked(
			"conversion_native_policy_node_conflict",
			"Each policy must identify a native source node in this retained document.",
		);
	}
	for (const node of nodes) {
		const policy = configuration.nativePolicies[node.id];
		const inherited = node.harness ?? doc.flow.harness;
		if (
			!policy ||
			!isDeepStrictEqual(inherited, policy.sourceHarness) ||
			(inherited !== null &&
				Object.entries(inherited).some(
					([key, value]) => policy.harness[key as keyof typeof policy.harness] !== value,
				))
		) {
			return blocked(
				"conversion_native_policy_unresolved",
				"An immutable policy must resolve the exact inherited harness, commands, model, and effort.",
				["nodes", node.id],
			);
		}
	}
	return {
		state: "ready",
		nativePolicies: structuredClone(configuration.nativePolicies),
		configuration: { bytes, sha256 },
		source,
		packageIdentity,
	};
};
