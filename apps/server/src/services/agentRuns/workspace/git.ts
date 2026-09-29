import { executionEnvironment } from "../../../executionEnvironment";

const read = (stream: ReadableStream<Uint8Array>) => new Response(stream).text();

// A Git call that runs for 30 s is stuck, and a stuck call would hold a
// request open until the server stops. Bun kills the process at the limit,
// and the call fails.
const timeoutMs = 30000;

export const git = async (workspace: string, args: string[]) => {
	const child = Bun.spawn(["git", "-c", "core.fsmonitor=false", "-C", workspace, ...args], {
		env: await executionEnvironment(),
		stdout: "pipe",
		stderr: "pipe",
		timeout: timeoutMs,
		killSignal: "SIGKILL",
	});
	const [stdout, stderr, code] = await Promise.all([read(child.stdout), read(child.stderr), child.exited]);
	if (code !== 0) throw new Error(stderr.trim() || `git ${args[0]} stopped with code ${code}`);
	return stdout;
};
