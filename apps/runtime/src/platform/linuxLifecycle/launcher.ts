import { delimiter, isAbsolute, resolve } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";

export type LinuxLaunchOperations = {
	executable: string;
	canExecute: (path: string) => boolean;
};

export function resolveLinuxExecutable(
	command: string,
	cwd: string,
	environment: NodeJS.ProcessEnv,
	operations: LinuxLaunchOperations,
): string {
	if (isAbsolute(command)) return command;
	if (command.includes("/")) return resolve(cwd, command);
	if (environment.PATH === undefined) throw new Error(`PATH is required to find executable ${command}`);
	for (const entry of environment.PATH.split(delimiter)) {
		const candidate = resolve(entry || cwd, command);
		if (operations.canExecute(candidate)) return candidate;
	}
	throw new Error(`Cannot find executable ${command} on PATH`);
}

export function linuxLaunchSpec(
	spec: LaunchSpec,
	cgroupProcsPath: string,
	operations: LinuxLaunchOperations,
): LaunchSpec {
	const environment = { ...process.env, ...spec.env };
	const executable = resolveLinuxExecutable(spec.command, spec.cwd, environment, operations);
	const source = [
		'import { writeFileSync } from "node:fs";',
		`writeFileSync(${JSON.stringify(cgroupProcsPath)}, String(process.pid));`,
		"const executable = process.argv[1];",
		"process.execve(executable, process.argv.slice(1), process.env);",
	].join("\n");
	return {
		...spec,
		command: operations.executable,
		args: ["--input-type=module", "--eval", source, "--", executable, ...spec.args],
	};
}
