import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

// The paths under a user home that `trellis install` writes. The test
// preload reads their mtimes before the first test and after the last test,
// and never writes them. The mtime of a directory changes when a file in it
// appears or goes away. The mtime of a file changes when its content changes.
export const guardedPaths = (home: string) => [
	join(home, "Library", "LaunchAgents"),
	join(home, "Library", "LaunchAgents", "com.trellis.server.plist"),
	join(home, ".local", "bin"),
	join(home, ".local", "bin", "trellis"),
	join(home, "projects", "margin", "src", "gateway.ts"),
];

// The mtime of each path, or null when the path does not exist.
export type Snapshot = Map<string, number | null>;

export const snapshot = (paths: string[]): Snapshot =>
	new Map(paths.map((path) => [path, existsSync(path) ? statSync(path).mtimeMs : null]));

export const changedPaths = (before: Snapshot, after: Snapshot) =>
	[...before.keys()].filter((path) => before.get(path) !== after.get(path));
