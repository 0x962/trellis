import { join, resolve } from "node:path";
import { verifyPackage } from "../verifyPackage";

export type CandidatePackage = {
	readonly qualification: "candidate";
	readonly enginePackageDigest: string;
	readonly componentManifestHash: string;
	readonly targetArchitecture: "arm64" | "x86_64";
	readonly engine: {
		readonly layoutDirectory: string;
		readonly image: string;
		readonly imageDigest: string;
	};
	readonly editor: { readonly rootDirectory: string };
	readonly manifestPath: string;
};

export async function loadCandidatePackage(root: string, expectedPackageId: string): Promise<CandidatePackage> {
	const absolute = resolve(root);
	const { recipe, packageId } = await verifyPackage(absolute, expectedPackageId);
	return Object.freeze({
		qualification: "candidate",
		enginePackageDigest: packageId,
		componentManifestHash: recipe.components.catalog.sha256,
		targetArchitecture: recipe.target.architecture,
		engine: Object.freeze({
			layoutDirectory: join(absolute, "payload", recipe.target.layout),
			image: recipe.target.image,
			imageDigest: recipe.target.imageDigest,
		}),
		editor: Object.freeze({ rootDirectory: join(absolute, "payload", recipe.editor.root) }),
		manifestPath: join(absolute, "package.json"),
	});
}
