import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { HomeImportPaths } from "./types.ts";
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
export const resolvePaths = (input: HomeImportPaths) => {
	const source = realpathSync(input.source);
	const target = canonicalTarget(input.target);
	if (inside(source, target) || inside(target, source))
		throw new Error("Source and target homes must be separate, non-nested directories.");
	if (!lstatSync(source).isDirectory() || !existsSync(join(source, "db", "PG_VERSION")))
		throw new Error(`Source ${source} does not contain a Trellis database.`);
	if (existsSync(target) && (!lstatSync(target).isDirectory() || readdirSync(target).length > 0))
		throw new Error(`Target ${target} must be empty.`);
	return { source, target };
};
