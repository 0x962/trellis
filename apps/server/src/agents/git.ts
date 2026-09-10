import { runnerUnavailable } from "./runner.ts";

// git reads the branches of a checkout the runner owns. The runner tells
// trellis where a project's checkout is, and nothing else names its
// branches, so `agents.setSettings` asks git before it stores a base
// branch. git is a system boundary: a missing binary and a path that is no
// repository both come back as the runner reason `error`.

const isMissing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

// True when `path` holds `branch` as a local branch or as a branch of a
// remote, which are the two forms `superset ws create --base-branch` takes.
export const hasBranch = async (path: string, branch: string): Promise<boolean> => {
	const args = ["-C", path, "for-each-ref", "--format=%(refname)", `refs/heads/${branch}`, `refs/remotes/*/${branch}`];
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn(["git", ...args], { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	} catch (error) {
		if (isMissing(error)) throw runnerUnavailable("error", "git binary not found");
		throw error;
	}
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout as ReadableStream).text(),
		new Response(proc.stderr as ReadableStream).text(),
		proc.exited,
	]);
	if (code !== 0) throw runnerUnavailable("error", `git for-each-ref in ${path}: ${stderr.trim()}`, code);
	return stdout.trim().length > 0;
};
