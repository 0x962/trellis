import { existsSync } from "node:fs";
import { cp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import { writeBundleManifest } from "../src/resourceBundle/resourceBundle.ts";

const repo = resolve(import.meta.dir, "../../..");
const target = resolve(import.meta.dir, "../dist/host");
type Manifest = {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};
const copies = new Map<string, string>();
const optionalPeers: { source: string; name: string; destination: string }[] = [];
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
		join(target, "modules", `${manifest.name.replaceAll("/", "_")}@${manifest.version}_${copies.size}`);
	copies.set(canonical, output);
	await cp(canonical, output, {
		recursive: true,
		verbatimSymlinks: true,
		filter: (path) => {
			const segments = relative(canonical, path).split("/");
			return (
				!segments.some((segment) => ["node_modules", ".git", ".cache", "test", "tests", "e2e"].includes(segment)) &&
				!/\.(test|spec|perf)\.[cm]?[jt]sx?$/.test(path)
			);
		},
	});
	for (const name of Object.keys({ ...manifest.peerDependencies, ...manifest.dependencies })) {
		if (!manifest.dependencies?.[name] && manifest.peerDependenciesMeta?.[name]?.optional === true) {
			optionalPeers.push({ source: canonical, name, destination: join(output, "node_modules", name) });
			continue;
		}
		const path = await packageAt(canonical, name);
		const dependency = await copyPackage(path);
		await link(dependency, join(output, "node_modules", name));
	}
	return output;
};

await rm(target, { recursive: true, force: true });
await mkdir(join(target, "bin"), { recursive: true });
for (const path of workspacePaths) {
	await copyPackage(join(repo, path), join(target, path));
}
for (const peer of optionalPeers) {
	let directory = peer.source;
	while (true) {
		const candidate = join(directory, "node_modules", peer.name);
		if (existsSync(join(candidate, "package.json"))) {
			const dependency = copies.get(await realpath(candidate));
			if (dependency) await link(dependency, peer.destination);
			break;
		}
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
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
const desktop = JSON.parse(await readFile(join(repo, "apps/desktop/package.json"), "utf8"));
await writeBundleManifest(target, desktop.version, RUNTIME_PROTOCOL_VERSION);
console.log(`Staged ${copies.size} packages at ${target}`);
