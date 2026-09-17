import { realpath } from "node:fs/promises";
import { git } from "./git.ts";

export const revision = async (workspace: string) => {
	const root = await realpath(workspace);
	const paths = [
		...new Set(
			(await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean),
		),
	].sort();
	const status = (await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"]))
		.split("\0")
		.filter(Boolean);
	const states = new Map(status.map((entry) => [entry.slice(3), entry.slice(0, 2)]));
	return { files: paths.map((path) => ({ path, status: states.get(path) ?? "  " })) };
};
