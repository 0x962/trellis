import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function swapDirectories(staged: string, installed: string) {
	const executable = join(dirname(staged), "swap-directories");
	await execute("/usr/bin/xcrun", ["clang", join(import.meta.dir, "swapDirectories.c"), "-o", executable]);
	await execute(executable, [staged, installed]);
}
