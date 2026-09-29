import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { CandidatePackage } from "../../../../../../integrations/langflow/release/loadCandidatePackage";
import type { InstalledEditorManifest } from "../../langflowEditorSessions/types";
import { createManifest } from "./components/createManifest.ts";

export async function installedEditorManifest(identity: CandidatePackage): Promise<InstalledEditorManifest> {
	const read = async (path: string, sha256: string) => {
		const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			if (!(await file.stat()).isFile()) throw new Error("editor_package_file_not_regular");
			const bytes = await file.readFile();
			if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("editor_package_file_changed");
			return bytes;
		} finally {
			await file.close();
		}
	};
	const catalogBytes = await read(identity.componentManifestPath, identity.componentManifestHash);
	const exportRef = identity.frontendTemplates;
	if (exportRef !== null && exportRef.engineOverlayHash !== identity.engineOverlayHash)
		throw new Error("editor_template_overlay_conflict");
	const templateBytes = exportRef === null ? null : await read(exportRef.path, exportRef.sha256);
	return createManifest({
		catalogBytes,
		templateBytes,
		componentManifestHash: identity.componentManifestHash,
		engineOverlayHash: identity.engineOverlayHash,
	});
}
