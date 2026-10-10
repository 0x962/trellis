import { delimiter, isAbsolute, posix, resolve } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";

export const sessionCgroup = (attemptsRoot: string, sessionId: number) =>
	posix.join(attemptsRoot, `session-${sessionId}`);

// The runtime starts each launch in a new OS session, so the PID of this shell
// ($$) is the session ID. The shell creates the cgroup of that session, moves
// itself into it, and then replaces itself with the agent. Every descendant of
// the agent starts inside that cgroup. Exit code 125 means the move failed.
const script = [
	'cgroup="$1/session-$$"',
	"shift",
	'mkdir -p "$cgroup" && printf "%s" "$$" > "$cgroup/cgroup.procs" || { echo "trellis: cannot join the attempt cgroup $cgroup" >&2; exit 125; }',
	'exec "$@"',
].join("\n");

export function resolveLinuxExecutable(
	command: string,
	cwd: string,
	environment: NodeJS.ProcessEnv,
	canExecute: (path: string) => boolean,
): string {
	if (isAbsolute(command)) return command;
	if (command.includes("/")) return resolve(cwd, command);
	if (environment.PATH === undefined) throw new Error(`PATH is required to find executable ${command}`);
	for (const entry of environment.PATH.split(delimiter)) {
		const candidate = resolve(entry || cwd, command);
		if (canExecute(candidate)) return candidate;
	}
	throw new Error(`Cannot find executable ${command} on PATH`);
}

// The executable is resolved before the launch, so a missing command fails
// the launch and does not become an exit of the shell.
export function wrapLinuxLaunch(
	spec: LaunchSpec,
	attemptsRoot: string,
	canExecute: (path: string) => boolean,
): LaunchSpec {
	const executable = resolveLinuxExecutable(spec.command, spec.cwd, { ...process.env, ...spec.env }, canExecute);
	return {
		...spec,
		command: "/bin/sh",
		args: ["-c", script, "trellis-attempt", attemptsRoot, executable, ...spec.args],
	};
}
