import { createHash } from "node:crypto";
import { posix } from "node:path";
import { z } from "zod";
import type { LangflowSidecarManifestV1 } from "../../../../../integrations/langflow/package-probe/sidecarManifest";
import type { CandidatePackage } from "../../../../../integrations/langflow/release";
import { readPrivateConfiguration } from "../privateConfiguration";

const absolutePath = z.string().refine(posix.isAbsolute);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const EngineConfigurationSchema = z.strictObject({
	version: z.literal(1),
	enginePackageDigest: digest,
	componentManifestHash: digest,
	engineCommit: z.string().regex(/^[a-f0-9]{40}$/),
	catalogPath: absolutePath,
	trellisRoot: absolutePath,
	engineRoot: absolutePath,
	userId: z.uuid(),
	exportRoot: absolutePath,
	nativeReservationOrigin: z.url().refine((value) => {
		const url = new URL(value);
		return ["http:", "https:"].includes(url.protocol) &&
			(value === url.origin || value === `${url.origin}/`);
	}),
	nativeReservationAuthenticationFile: absolutePath,
});

export async function readEngineConfiguration(filePath: string, qualified: {
	candidate: CandidatePackage;
	manifest: LangflowSidecarManifestV1;
}) {
	const sourceBytes = await readPrivateConfiguration(filePath);
	const configuration = EngineConfigurationSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes)));
	const { candidate, manifest } = qualified;
	if (
		configuration.enginePackageDigest !== candidate.enginePackageDigest ||
		configuration.componentManifestHash !== candidate.componentManifestHash ||
		configuration.engineCommit !== manifest.source.commit ||
		configuration.catalogPath !== posix.join("/opt/trellis/inputs", manifest.components.catalog.path) ||
		configuration.trellisRoot !== "/opt/trellis/inputs/catalog/trellis" ||
		configuration.engineRoot !== "/opt/trellis/inputs/catalog/engine" ||
		configuration.nativeReservationAuthenticationFile !== "/run/trellis-secrets/native-reservations.token"
	)
		throw new Error("langflow_engine_configuration_conflict");
	return { sourceBytes, sha256: createHash("sha256").update(sourceBytes).digest("hex") };
}
