import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { canonicalBytes } from "../canonicalBytes";
import { inspectPackage } from "../inspectPackage";

export async function verifyPackage(root: string, expectedPackageId: string) {
	if (!(await lstat(root)).isDirectory()) throw new Error("package_directory_required");
	if ((await readdir(root)).sort().join(",") !== "package.json,payload") throw new Error("package_unlisted_entry");
	const path = join(root, "package.json");
	if (!(await lstat(path)).isFile()) throw new Error("package_manifest_not_regular");
	const bytes = await readFile(path, "utf8");
	const saved = JSON.parse(bytes);
	const inspected = await inspectPackage(join(root, "payload"), saved.recipe);
	if (inspected.packageId !== expectedPackageId || bytes !== `${canonicalBytes(inspected)}\n`) {
		throw new Error("package_seal_mismatch");
	}
	return inspected;
}
