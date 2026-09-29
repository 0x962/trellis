import type { ConcreteConversionProducer } from "../conversionCompilerTypes";
import type { ConversionEditProducer } from "../conversionEditTypes";
import { createConversionProducer } from "../createConversionProducer";
import { readTrustedNativePolicies } from "../readTrustedNativePolicies";
import type { TrustedConversionProducerInput } from "../trustedNativePolicyTypes";

export const createTrustedConversionProducer = (
	value: TrustedConversionProducerInput,
	validate: ConversionEditProducer["validate"],
): ConcreteConversionProducer => {
	const input = structuredClone(value);
	const packageIdentity = {
		enginePackageDigest: input.enginePackageDigest,
		componentManifestHash: input.componentManifestHash,
		engineOverlayHash: input.engineOverlayHash,
	};
	const read = (sourceBytes: Uint8Array) =>
		readTrustedNativePolicies({ configuration: input.configuration, sourceBytes, packageIdentity });
	return {
		enginePackageDigest: input.enginePackageDigest,
		componentManifestHash: input.componentManifestHash,
		catalogBytes: Buffer.from(input.catalogBytes),
		compile: async ({ sourceBytes }) => {
			const bytes = Buffer.from(sourceBytes);
			const policies = read(bytes);
			if (policies.state === "blocked") return { ...policies, candidate: null };
			return createConversionProducer({ ...input, nativePolicies: policies.nativePolicies }, validate).compile({
				sourceBytes: bytes,
			});
		},
		regenerate: async ({ editedSourceBytes, previousGraphDocument }) => {
			const bytes = Buffer.from(editedSourceBytes);
			const policies = read(bytes);
			if (policies.state === "blocked") return { ...policies, candidate: null };
			return createConversionProducer({ ...input, nativePolicies: policies.nativePolicies }, validate).regenerate({
				editedSourceBytes: bytes,
				previousGraphDocument,
			});
		},
		validate,
	};
};
