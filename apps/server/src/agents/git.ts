// git reads the branches of a checkout the runner owns. The runner tells
// trellis where a project's checkout is, and nothing else names its
// branches, so `agents.setSettings` asks git before it stores a base
// branch.
//
// The runner also lists projects whose checkout this machine cannot read: a
// project on another host, or one nobody has cloned here yet. trellis has no
// answer for those, and refusing the save would block a setting that works.
// So the answer has three values, and only `absent` refuses a save.

export type BranchAnswer =
	// The checkout holds the branch.
	| "present"
	// The checkout answers, and it does not hold the branch.
	| "absent"
	// This machine cannot read the checkout, so git names no branch.
	| "unreadable";

const isMissing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

// Whether `path` holds `branch` as a local branch or as a branch of a
// remote, which are the two forms `superset ws create --base-branch` takes.
export const branchState = async (path: string, branch: string): Promise<BranchAnswer> => {
	const args = ["-C", path, "for-each-ref", "--format=%(refname)", `refs/heads/${branch}`, `refs/remotes/*/${branch}`];
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn(["git", ...args], { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	} catch (error) {
		if (isMissing(error)) return "unreadable";
		throw error;
	}
	const [stdout, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), proc.exited]);
	if (code !== 0) return "unreadable";
	return stdout.trim().length > 0 ? "present" : "absent";
};
