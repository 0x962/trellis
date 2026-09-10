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

// `git for-each-ref` reads a pattern without a glob as the start of a path,
// so the pattern `refs/heads/m0` also prints `refs/heads/m0/api`. A
// repository that holds `m0/api` and no `m0` would otherwise answer that it
// holds `m0`, and `superset ws create --base-branch m0` would then fail.
// Each printed refname is therefore compared to the two names that mean the
// branch itself.
const namesBranch = (refname: string, branch: string) => {
	if (refname === `refs/heads/${branch}`) return true;
	const remotes = "refs/remotes/";
	if (!refname.startsWith(remotes)) return false;
	// What follows is `<remote>/<branch>`, and a remote name holds no slash.
	const rest = refname.slice(remotes.length);
	const slash = rest.indexOf("/");
	return slash !== -1 && rest.slice(slash + 1) === branch;
};

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
	const printed = stdout.split("\n").map((line) => line.trim());
	return printed.some((refname) => namesBranch(refname, branch)) ? "present" : "absent";
};
