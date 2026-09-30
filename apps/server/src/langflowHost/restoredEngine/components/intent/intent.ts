import { loadQualifiedPackage } from "../../../../../../../integrations/langflow/release";
import { protocolDigest } from "../../../../langflowContracts";
import { assertManifestRuntime } from "../../../ociDriver/manifestRuntime/manifestRuntime";
import { storageNames } from "../../../ociDriver/storage/storage";
import { EngineInstallIntentSchema, type RestoredEngineInput } from "../../contracts";
import type { InstallContext } from "../context";
import type { readEngineSource } from "../source";

export async function engineInstallIntent(
	ctx: InstallContext,
	input: RestoredEngineInput,
	source: Awaited<ReturnType<typeof readEngineSource>>,
) {
	if (input.qualification.dataHomeId !== ctx.identity.dataHomeId)
		throw new Error("restored_engine_qualification_home_conflict");
	const qualified = await loadQualifiedPackage(input.qualification);
	if (qualified.candidate.enginePackageDigest !== source.compatibility.enginePackageDigest ||
		qualified.manifest.target.kind !== "linux-oci")
		throw new Error("restored_engine_package_conflict");
	assertManifestRuntime(qualified.manifest);
	return EngineInstallIntentSchema.parse({
		version: 1, identity: ctx.identity, block: input.block, capture: source.capture,
		package: {
			enginePackageDigest: qualified.candidate.enginePackageDigest,
			imageConfigDigest: qualified.candidate.engine.imageConfigDigest,
			imageDigest: qualified.manifest.target.imageDigest,
			qualificationSha256: qualified.qualificationSha256,
			manifestDigest: protocolDigest(JSON.stringify(qualified.manifest)),
			architecture: qualified.manifest.target.architecture === "arm64" ? "arm64" : "amd64",
		},
		target: {
			privateRoot: ctx.privateRoot, privateRootDigest: protocolDigest(ctx.privateRoot),
			volumes: storageNames(ctx.identity), databasePath: "/data/config/langflow.db",
			secretPath: "/run/trellis-secrets/engine-secret",
		},
	});
}
