import { existsSync } from "node:fs";
import { cp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../..");
const target = resolve(import.meta.dir, "../dist/host");
type Manifest = { name: string; version: string; dependencies?: Record<string, string> };
const copies = new Map<string, string>();
const workspacePaths = ["apps/server", "packages/api", "packages/cli", "apps/runtime", "packages/runtime-protocol"];
const workspaceDestinations = new Map(workspacePaths.map((path) => [join(repo, path), join(target, path)]));

const packageAt = async (from: string, name: string): Promise<string> => {
	let directory = from;
	while (true) {
		const path = join(directory, "node_modules", name);
		if (existsSync(join(path, "package.json"))) return realpath(path);
		const parent = dirname(directory);
		if (parent === directory) throw new Error(`Cannot resolve ${name} from ${from}. Run bun install first.`);
		directory = parent;
	}
};

const link = async (source: string, destination: string) => {
	await mkdir(dirname(destination), { recursive: true });
	await symlink(relative(dirname(destination), source), destination);
};

const copyPackage = async (source: string, destination?: string): Promise<string> => {
	const canonical = await realpath(source);
	const existing = copies.get(canonical);
	if (existing) return existing;
	const manifest: Manifest = JSON.parse(await readFile(join(canonical, "package.json"), "utf8"));
	const output =
		destination ??
		workspaceDestinations.get(canonical) ??
		join(target, "modules", `${manifest.name.replaceAll("/", "_")}@${manifest.version}`);
	copies.set(canonical, output);
	await cp(canonical, output, {
		recursive: true,
		filter: (path) => {
			const segments = relative(canonical, path).split("/");
			return (
				!segments.some((segment) => ["node_modules", ".git", "test", "tests", "e2e"].includes(segment)) &&
				!/\.(test|perf)\.[cm]?[jt]sx?$/.test(path)
			);
		},
	});
	for (const name of Object.keys(manifest.dependencies ?? {})) {
		const dependency = await copyPackage(await packageAt(canonical, name));
		await link(dependency, join(output, "node_modules", name));
	}
	return output;
};

await rm(target, { recursive: true, force: true });
await mkdir(join(target, "bin"), { recursive: true });
for (const path of workspacePaths) {
	await copyPackage(join(repo, path), join(target, path));
}
await cp(join(repo, "apps/web/dist"), join(target, "apps/web/dist"), { recursive: true });
await cp(process.execPath, join(target, "bin/bun"));
const nodePackage = await packageAt(repo, "node");
await cp(join(nodePackage, "bin/node"), join(target, "bin/node"));
await writeFile(
	join(target, "bin/trellis"),
	'#!/bin/sh\nexec "$(dirname "$0")/bun" "$(dirname "$0")/../packages/cli/src/index.ts" "$@"\n',
	{ mode: 0o755 },
);
await writeFile(join(target, "package.json"), JSON.stringify({ private: true, type: "module" }));
await writeFile(
	join(target, "build.json"),
	JSON.stringify(
		{ bun: Bun.version, node: "26.8.2", platform: process.platform, arch: process.arch, packages: copies.size },
		null,
		2,
	),
);
console.log(`Staged ${copies.size} packages at ${target}`);
