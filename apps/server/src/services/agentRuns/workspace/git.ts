import { executionEnvironment } from "../../../executionEnvironment";

const read = async (stream: ReadableStream<Uint8Array>, limit: number) => {
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of stream) {
		if (size < limit) chunks.push(chunk.subarray(0, limit - size));
		size += chunk.byteLength;
	}
	return { text: Buffer.concat(chunks).toString("utf8"), size };
};

export const git = async (workspace: string, args: string[], options = { limit: 16777216, truncate: false }) => {
	const child = Bun.spawn(["git", "-c", "core.fsmonitor=false", "-C", workspace, ...args], {
		env: await executionEnvironment(),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		read(child.stdout, options.limit),
		read(child.stderr, 8192),
		child.exited,
	]);
	if (code !== 0) throw new Error(stderr.text.trim());
	if (!options.truncate && stdout.size > options.limit)
		throw new Error("The Git file list exceeds the workspace byte limit.");
	return stdout.text;
};
