import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeBundleManifest } from "../../../../src/resourceBundle/resourceBundle.ts";
import { restartHost } from "../../../../src/restartHost/index.ts";

for (const unknown of [false, true]) {
	test(`${unknown ? "unknown" : "incompatible"} runtime ownership blocks restart before service commands`, async () => {
		const directory = await mkdtemp("/tmp/trl-restart-blocked-");
		const home = join(directory, "host");
		const resources = join(directory, "resources");
		try {
			await mkdir(resources);
			await writeBundleManifest(resources, "next", 7);
			await mkdir(join(home, "runtime"), { recursive: true });
			if (unknown) await writeFile(join(home, "runtime/runtime.sock"), "");
			else await writeFile(join(home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 6 }));
			await expect(
				restartHost({
					mode: "packaged",
					home,
					resources,
					userData: directory,
					helper: "/missing-helper",
				}),
			).rejects.toThrow(unknown ? "unknown" : "protocol 6");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
}
