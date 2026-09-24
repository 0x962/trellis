import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeDesktopBuild(desktop: string, host: string) {
	const files = [
		"dist/main.cjs",
		"dist/startup.html",
		"dist/preload.cjs",
		"dist/host-service.cjs",
		"dist/TrellisHost",
		"dist/processor-temperature",
		"native/com.trellis.desktop.host.plist",
	];
	const hashes: Record<string, string> = {};
	for (const file of files)
		hashes[file] = createHash("sha256")
			.update(await readFile(join(desktop, file)))
			.digest("hex");
	await writeFile(join(host, "desktop-build.json"), `${JSON.stringify(hashes, null, 2)}\n`);
}
