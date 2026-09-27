import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";

export type LinuxLaunchOperations = {
	executable: string;
	canExecute: (path: string) => boolean;
};

const nodeLaunchOperations: LinuxLaunchOperations = {
	executable: process.execPath,
	canExecute(path) {
		try {
			accessSync(path, constants.X_OK);
			return true;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "EACCES" || code === "ENOENT" || code === "ENOTDIR") return false;
			throw error;
		}
	},
};

export function resolveLinuxExecutable(
	command: string,
	cwd: string,
	environment: NodeJS.ProcessEnv,
	operations: LinuxLaunchOperations = nodeLaunchOperations,
): string {
	if (isAbsolute(command)) return command;
	if (command.includes("/")) return resolve(cwd, command);
	for (const entry of (environment.PATH ?? "").split(delimiter)) {
		const candidate = resolve(entry || cwd, command);
		if (operations.canExecute(candidate)) return candidate;
	}
	throw new Error(`Cannot find executable ${command} on PATH`);
}

export function linuxLaunchSpec(
	spec: LaunchSpec,
	cgroupProcsPath: string,
	operations: LinuxLaunchOperations = nodeLaunchOperations,
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
