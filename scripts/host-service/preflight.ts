import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type {
	LinuxCommandResult,
	LinuxServicePreflightContext,
} from "../../packages/cli/src/host/linuxService/index.ts";
import { readHostReleaseManifest, verifyHostRelease } from "../host-release/manifest/index.ts";

export type HostServicePreflightInput = {
	releaseRoot: string;
	context: LinuxServicePreflightContext;
	preflightScript: string;
	run: (args: string[]) => Promise<LinuxCommandResult>;
};

export const hostServicePreflight = async (input: HostServicePreflightInput): Promise<void> => {
	const releaseRoot = await realpath(input.releaseRoot);
	const verification = await verifyHostRelease(releaseRoot);
	if (!verification.ok)
		throw new Error(`Host release verification failed: ${JSON.stringify(verification.issues)}`);
	const manifest = await readHostReleaseManifest(releaseRoot);
	const executable = await realpath(join(releaseRoot, manifest.entrypoints.bun));
	const executablePath = relative(releaseRoot, executable);
	if (executablePath === ".." || executablePath.startsWith("../") || isAbsolute(executablePath))
		throw new Error("The host release Bun entrypoint resolves outside the release.");
	const releaseCommand = [executable, input.preflightScript, "--release", releaseRoot];
	const command =
		input.context === "systemd"
			? [
					"systemd-run",
					"--user",
					"--quiet",
					"--wait",
					"--pipe",
					"--collect",
					"--property=Type=exec",
					"--property=Delegate=yes",
					...releaseCommand,
				]
			: releaseCommand;
	const result = await input.run(command);
	if (result.code !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim();
		throw new Error(`Host preflight failed with exit code ${result.code}: ${detail}`);
	}
};
