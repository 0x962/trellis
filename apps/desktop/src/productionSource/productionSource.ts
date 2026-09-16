import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function assertProductionSource(
	repo: string,
	input: { phase: "build" } | { phase: "publish"; commit: string },
) {
	const git = async (...args: string[]) => (await execute("/usr/bin/git", args, { cwd: repo })).stdout.trim();
	if (input.phase === "build") {
		const branch = await git("branch", "--show-current");
		if (branch !== "main") {
			throw new Error(
				`Production builds require a clean main checkout. Current checkout: ${branch || "detached HEAD"}. Merge the source into main first.`,
			);
		}
		if (await git("status", "--porcelain")) throw new Error("Commit all source changes before the production build.");
	}
	await git("fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main");
	const published = await git("rev-parse", "refs/remotes/origin/main");
	if (input.phase === "build") {
		const commit = await git("rev-parse", "HEAD");
		if (commit !== published) {
			throw new Error(
				`Production source ${commit} must equal freshly fetched origin/main ${published}. Merge and push the source to main, then update this main checkout.`,
			);
		}
		return commit;
	}
	const child = Bun.spawn(["/usr/bin/git", "merge-base", "--is-ancestor", input.commit, published], {
		cwd: repo,
		stdin: "ignore",
		stdout: "ignore",
		stderr: "pipe",
	});
	const stderr = await new Response(child.stderr).text();
	if ((await child.exited) !== 0) {
		throw new Error(
			`Candidate ${input.commit} is not part of freshly fetched origin/main ${published}. Merge the source into main and build again.${stderr.trim() ? ` Git: ${stderr.trim()}` : ""}`,
		);
	}
	return input.commit;
}
