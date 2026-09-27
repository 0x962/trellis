import type {
	LinuxCommandResult,
	LinuxServicePreflightContext,
} from "../../packages/cli/src/host/linuxService/index.ts";

export type HostServicePreflightInput = {
	releaseRoot: string;
	context: LinuxServicePreflightContext;
	executable: string;
	preflightScript: string;
	run: (args: string[]) => Promise<LinuxCommandResult>;
};

export const hostServicePreflight = async (input: HostServicePreflightInput): Promise<void> => {
	const releaseCommand = [input.executable, input.preflightScript, "--release", input.releaseRoot];
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
