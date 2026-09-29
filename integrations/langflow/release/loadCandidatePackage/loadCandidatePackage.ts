import { inspectCandidatePackage } from "../inspectCandidatePackage";

export type CandidatePackage = {
	readonly qualification: "candidate";
	readonly enginePackageDigest: string;
	readonly componentManifestHash: string;
	readonly componentManifestPath: string;
	readonly engineOverlayHash: string;
	readonly targetArchitecture: "arm64" | "x86_64";
	readonly engine: {
		readonly layoutDirectory: string;
		readonly image: string;
		readonly imageDigest: string;
		readonly imageConfigDigest: string;
	};
	readonly editor: { readonly rootDirectory: string };
	readonly frontendTemplates: {
		readonly path: string;
		readonly sha256: string;
		readonly engineOverlayHash: string;
	} | null;
	readonly manifestPath: string;
};

export async function loadCandidatePackage(root: string, expectedPackageId: string): Promise<CandidatePackage> {
	return (await inspectCandidatePackage(root, expectedPackageId)).candidate;
}
