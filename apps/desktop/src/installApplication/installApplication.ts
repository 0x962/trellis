import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { swapDirectories } from "./swapDirectories/swapDirectories.ts";

const execute = promisify(execFile);

export async function installApplication(
	source: string,
	destination: string,
	verify: (application: string) => Promise<unknown> = (application) =>
		execute("/usr/bin/codesign", ["--verify", "--deep", "--strict", application]),
) {
	await mkdir(dirname(destination), { recursive: true });
	const staging = await mkdtemp(join(dirname(destination), ".trellis-install-"));
	const application = join(staging, "Trellis.app");
	await execute("/usr/bin/ditto", [source, application]);
	await verify(application);
	if (existsSync(destination)) await swapDirectories(application, destination);
	else await rename(application, destination);
	await rm(staging, { recursive: true });
}
