import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
	const absolute = resolve(root);
	const { recipe, packageId } = await verifyPackage(absolute, expectedPackageId);
	const layoutDirectory = join(absolute, "payload", recipe.target.layout);
	const manifestBytes = await readFile(join(layoutDirectory, "blobs/sha256", recipe.target.imageDigest.slice(7)));
	if (`sha256:${createHash("sha256").update(manifestBytes).digest("hex")}` !== recipe.target.imageDigest) {
		throw new Error("oci_manifest_changed");
	}
	const manifest = JSON.parse(manifestBytes.toString("utf8")) as { config: { digest: string } };
	return Object.freeze({
		qualification: "candidate",
		enginePackageDigest: packageId,
		componentManifestHash: recipe.components.catalog.sha256,
		targetArchitecture: recipe.target.architecture,
		engine: Object.freeze({
			layoutDirectory,
			image: recipe.target.image,
			imageDigest: recipe.target.imageDigest,
			imageConfigDigest: manifest.config.digest,
		}),
		editor: Object.freeze({ rootDirectory: join(absolute, "payload", recipe.editor.root) }),
		frontendTemplates: recipe.frontendTemplates
			? Object.freeze({
					path: join(absolute, "payload", recipe.frontendTemplates.path),
					sha256: recipe.frontendTemplates.sha256,
					engineOverlayHash: recipe.patchSet.sha256,
				})
			: null,
		manifestPath: join(absolute, "package.json"),
	});
}
