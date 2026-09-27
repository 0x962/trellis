import { evaluateHostReleasePreflight } from "@trellis/api";
import { readHostReleaseManifest, verifyHostRelease } from "../manifest/index.ts";
import { observeHost } from "../observeHost/index.ts";

type HostReleasePreflightDependencies = {
	readManifest: typeof readHostReleaseManifest;
	verify: typeof verifyHostRelease;
	observe: typeof observeHost;
};

const defaultDependencies: HostReleasePreflightDependencies = {
	readManifest: readHostReleaseManifest,
	verify: verifyHostRelease,
	observe: observeHost,
};

const observationFailure = (error: unknown): { observationError: string } => ({
	observationError: error instanceof Error ? error.message : String(error),
});

export const hostReleasePreflightResult = async (
	root: string,
	dependencies: HostReleasePreflightDependencies = defaultDependencies,
) => {
	const manifest = await dependencies.readManifest(root);
	const [verification, observed] = await Promise.all([
		dependencies.verify(root),
		dependencies.observe().then(
			(observation) => ({ observation }),
			(error: unknown) => observationFailure(error),
		),
	]);
	if ("observationError" in observed)
		return {
			schemaVersion: 1 as const,
			ok: false as const,
			releaseId: manifest.releaseId,
			verification,
			compatibility: null,
			observationError: observed.observationError,
		};
	const compatibility = evaluateHostReleasePreflight(manifest.target, observed.observation);
	return {
		schemaVersion: 1 as const,
		ok: verification.ok && compatibility.ok,
		releaseId: manifest.releaseId,
		verification,
		compatibility,
	};
};
