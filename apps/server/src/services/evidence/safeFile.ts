import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { invalidInput } from "../../errors.ts";

export const safeFile = async (workspace: string, path: string) => {
	if (isAbsolute(path) || path.includes("\0") || path.split(/[\\/]/).includes(".."))
		throw invalidInput("path", "Use a relative path inside this agent workspace.");
	const root = await realpath(workspace);
	const file = await realpath(resolve(root, path));
	const within = relative(root, file);
	if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within))
		throw invalidInput("path", "This path leaves the agent workspace through a symlink.");
	return file;
};
