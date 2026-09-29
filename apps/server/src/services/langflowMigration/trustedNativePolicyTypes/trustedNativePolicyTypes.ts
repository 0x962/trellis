import type { FlowDiagnosticV1 } from "@trellis/api";
import type { ConversionCompilerInput } from "../conversionCompilerTypes";
import type { NativePolicyConfigurationV1 } from "../nativePolicyConfiguration";

export type TrustedNativePolicyInput = {
	configuration: { bytes: Uint8Array; sha256: string } | null;
	sourceBytes: Uint8Array;
	packageIdentity: Pick<ConversionCompilerInput, "enginePackageDigest" | "componentManifestHash" | "engineOverlayHash">;
};

export type TrustedConversionProducerInput = Omit<ConversionCompilerInput, "nativePolicies"> & {
	configuration: TrustedNativePolicyInput["configuration"];
};

export type TrustedNativePolicyResult =
	| { state: "blocked"; diagnostics: FlowDiagnosticV1[] }
	| {
			state: "ready";
			nativePolicies: ConversionCompilerInput["nativePolicies"];
			configuration: { bytes: Buffer; sha256: string } | null;
			source: NativePolicyConfigurationV1["source"];
			packageIdentity: TrustedNativePolicyInput["packageIdentity"];
	  };
