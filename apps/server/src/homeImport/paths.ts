import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
export const inside = (parent: string, path: string) => {
	const value = relative(parent, path);
	return value === "" || (!value.startsWith("../") && value !== ".." && !isAbsolute(value));
};
export const canonicalTarget = (path: string): string => {
	const absolute = resolve(path);
	if (existsSync(absolute)) return realpathSync(absolute);
	if (lstatSync(absolute, { throwIfNoEntry: false })?.isSymbolicLink())
		throw new Error(`Path ${absolute} is a dangling symlink.`);
	return join(canonicalTarget(dirname(absolute)), basename(absolute));
};
