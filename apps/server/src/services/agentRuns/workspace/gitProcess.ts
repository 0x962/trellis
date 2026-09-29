import { executionEnvironment } from "../../../executionEnvironment";

const readError = async (stream: ReadableStream<Uint8Array>) => {
	const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
	let text = "";
	for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
	return text + decoder.decode();
};

export const runGit = async <T>(
	workspace: string,
	args: string[],
	signal: AbortSignal | undefined,
	readOutput: (stream: ReadableStream<Uint8Array>) => Promise<T>,
) => {
	signal?.throwIfAborted();
	const env = await executionEnvironment();
	signal?.throwIfAborted();
	const child = Bun.spawn(["git", "-c", "core.fsmonitor=false", "-C", workspace, ...args], {
		env,
		detached: true,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stop = () => {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	};
	signal?.addEventListener("abort", stop, { once: true });
	try {
		const [output, stderr, code] = await Promise.all([readOutput(child.stdout), readError(child.stderr), child.exited]);
		signal?.throwIfAborted();
		if (code !== 0) throw new Error(stderr.trim() || `git ${args[0]} stopped with code ${code}`);
		return output;
	} finally {
		signal?.removeEventListener("abort", stop);
		stop();
		await child.exited;
	}
};
