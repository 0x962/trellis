import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { MemoryContext } from "expo-router/build/testing-library/context-stubs";

// The route tests sit inside app/ beside the routes they test. expo-router
// reads every .tsx file under app/ as a route, and a file named
// `_layout.test.tsx` even counts as a layout. This context holds the route
// modules only, keyed by the route path without an extension, so
// renderRouter renders the tree the app ships.
const appDir = join(__dirname, "..", "app");

const isRoute = (name: string) => /\.[jt]sx?$/.test(name) && !/\.test\.[jt]sx?$/.test(name);

const routeFiles = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return routeFiles(path);
		return isRoute(entry.name) ? [path] : [];
	});

const routeKey = (path: string) =>
	relative(appDir, path)
		.split(sep)
		.join("/")
		.replace(/\.[jt]sx?$/, "");

export const appContext = (): MemoryContext =>
	Object.fromEntries(routeFiles(appDir).map((path) => [routeKey(path), require(path)]));
