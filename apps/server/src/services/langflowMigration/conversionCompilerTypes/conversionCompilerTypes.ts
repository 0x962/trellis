import type { FlowDiagnosticV1, FlowHarness } from "@trellis/api";
import type { z } from "zod";
import type { ConversionEditProducer } from "../conversionEditTypes";
import type { ConversionExpansionV1 } from "../conversionIntakeTypes";

export type CompilerJson = z.infer<ReturnType<typeof z.json>>;
export type CompilerObject = Record<string, CompilerJson>;
export type CompilerHarness = {
	preset: string;
	startCommand: string;
	resumeCommand: string;
	model?: string;
	effort?: string;
};
export type ConversionCompilerInput = {
	catalogBytes: Uint8Array;
	frontendTemplateBytes: Uint8Array | null;
	componentManifestHash: string;
	enginePackageDigest: string;
	engineCommit: string;
	engineOverlayHash: string;
	nativePolicies: Record<string, { sourceHarness: FlowHarness | null; harness: CompilerHarness }>;
};
export type ConversionCompileResult =
	| { state: "blocked"; diagnostics: FlowDiagnosticV1[]; candidate: ConversionExpansionV1 | null }
	| { state: "generated"; expansion: ConversionExpansionV1 };
export type ConcreteConversionProducer = ConversionEditProducer & {
	compile(input: { sourceBytes: Uint8Array }): Promise<ConversionCompileResult>;
};
export type CompilerNode = {
	id: string;
	type: "genericNode";
	position: { x: number; y: number };
	data: { id: string; type: string; node: CompilerObject; showNode: boolean };
};
export type CompilerEndpoint = { node: CompilerNode; port: string };
export type CompiledSourceNode = {
	input: CompilerEndpoint;
	scopeInput: CompilerEndpoint;
	outputs: Partial<Record<"out" | "yes" | "no", CompilerEndpoint>>;
	settlement: CompilerEndpoint | null;
};
