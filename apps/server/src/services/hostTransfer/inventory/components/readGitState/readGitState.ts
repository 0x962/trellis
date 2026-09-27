import { isAbsolute, resolve } from "node:path";
import { runGit } from "../../../../../git/index.ts";

export type GitState = {
	commonDirectory: string;
	dirtyPaths: string[];
};

export type GitReader = (workspace: string, args: string[]) => Promise<string>;

const dirtyPathsOf = (output: string) => {
	const records = output.split("\0");
	const paths: string[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record) continue;
		const status = record.slice(0, 2);
		paths.push(record.slice(3));
		if (/[RC]/.test(status)) {
			const priorPath = records[index + 1];
			if (priorPath) paths.push(priorPath);
			index += 1;
		}
	}
	return [...new Set(paths)].sort();
};

export const readGitState = async (workspace: string, readGit: GitReader = runGit): Promise<GitState> => {
	const [commonDirectoryText, status] = await Promise.all([
		readGit(workspace, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
		readGit(workspace, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
	]);
	const commonDirectory = commonDirectoryText.trim();
	return {
		commonDirectory: isAbsolute(commonDirectory) ? commonDirectory : resolve(workspace, commonDirectory),
		dirtyPaths: dirtyPathsOf(status),
	};
};
