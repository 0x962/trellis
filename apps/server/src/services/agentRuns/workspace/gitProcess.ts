import { executionEnvironment } from "../../../executionEnvironment";

const readError = async (stream: ReadableStream<Uint8Array>) => {
	const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
	let text = "";
	for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
	return text + decoder.decode();
};

// Git calls use a 30-second process deadline. Bun sends SIGKILL when the
// deadline expires, and runGit returns the process error.
const timeoutMs = 30000;

export const runGit = async <T>(
	workspace: string,
	args: string[],
	readOutput: (stream: ReadableStream<Uint8Array>) => Promise<T>,
) => {
	const child = Bun.spawn(["git", "-c", "core.fsmonitor=false", "-C", workspace, ...args], {
		env: await executionEnvironment(),
		stdout: "pipe",
		stderr: "pipe",
		timeout: timeoutMs,
		killSignal: "SIGKILL",
	});
	const [output, stderr, code] = await Promise.all([readOutput(child.stdout), readError(child.stderr), child.exited]);
	if (code !== 0) throw new Error(stderr.trim() || `git ${args[0]} stopped with code ${code}`);
	return output;
};
