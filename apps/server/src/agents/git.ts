// Reading a branch out of a checkout on this machine.

// What a checkout says about one branch name. `unreadable` means git gave
// no answer: the directory is gone, it is not a repository, or git itself
// is missing. A checkout that gives no answer must not refuse a settings
// save, because Superset also lists projects whose checkout this machine
// never cloned.
export type BranchState = "present" | "absent" | "unreadable";

// True when `refname` is the branch itself and not a longer name that
// starts with it. `refs/heads/m0` and `refs/remotes/origin/m0` name the
// branch `m0`; `refs/heads/m0/api` names a different branch.
const namesBranch = (refname: string, branch: string) => {
	if (refname === `refs/heads/${branch}`) return true;
	const remotes = "refs/remotes/";
	if (!refname.startsWith(remotes)) return false;
	const afterRemotes = refname.slice(remotes.length);
	const firstSlash = afterRemotes.indexOf("/");
	return firstSlash !== -1 && afterRemotes.slice(firstSlash + 1) === branch;
};

// Whether the checkout at `path` holds `branch`, as a local branch or as a
// branch of any remote. Those are the two forms `superset ws create
// --base-branch` accepts.
//
// `git for-each-ref` reads a pattern that holds no glob as the start of a
// path, so the pattern `refs/heads/m0` also prints `refs/heads/m0/api`.
// Every printed name is therefore compared in full, and a branch that only
// prefixes another name counts as absent.
export const branchState = async (path: string, branch: string): Promise<BranchState> => {
	const args = ["-C", path, "for-each-ref", "--format=%(refname)", `refs/heads/${branch}`, `refs/remotes/*/${branch}`];
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn(["git", ...args], { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	} catch {
		return "unreadable";
	}
	const [stdout, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), proc.exited]);
	if (code !== 0) return "unreadable";
	const found = stdout
		.split("\n")
		.map((line) => line.trim())
		.some((refname) => refname !== "" && namesBranch(refname, branch));
	return found ? "present" : "absent";
};
