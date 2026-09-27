import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
	HOST_RELEASE_MANIFEST_VERSION,
	type HostReleaseCompatibility,
	type HostReleaseManifest,
	type HostReleaseTarget,
} from "@trellis/api";
import { verifyHostRelease, writeHostReleaseManifest } from "../manifest/index.ts";
import { type StagedPackage, stagePackageClosure } from "../packageClosure/index.ts";

const workspacePaths = [
	"apps/server",
	"packages/api",
	"packages/cli",
	"apps/runtime",
	"packages/runtime-protocol",
];
const nativeModuleNames = ["node-pty", "fs-ext", "koffi"];
const entrypointPayloads = ["apps/server/src/index.ts", "apps/runtime/dist/index.js", "packages/cli/src/index.ts"];

type DrizzleJournal = { entries: { tag: string }[] };

export type BuildHostReleaseInput = {
	repositoryRoot: string;
	outputRoot: string;
	version: string;
	sourceCommit: string;
	target: HostReleaseTarget;
	compatibility: HostReleaseCompatibility;
	bun: { executable: string; version: string };
	node: { executable: string; version: string; abi: string };
};

const executable = async (path: string, contents: string) => writeFile(path, contents, { mode: 0o755 });

const hasNativeBinary = async (root: string, visited = new Set<string>()): Promise<boolean> => {
	const canonical = await realpath(root);
	if (visited.has(canonical)) return false;
	visited.add(canonical);
	for (const entry of await readdir(canonical, { withFileTypes: true })) {
		const path = join(canonical, entry.name);
		if (entry.isDirectory() && (await hasNativeBinary(path, visited))) return true;
		if (entry.isSymbolicLink()) {
			const target = await realpath(path);
			if ((await lstat(target)).isDirectory() && (await hasNativeBinary(target, visited))) return true;
		}
		if (entry.isFile() && entry.name.endsWith(".node")) return true;
	}
	return false;
};

const nativeModuleOf = async (
	packages: StagedPackage[],
	name: string,
	outputRoot: string,
	nodeAbi: string,
): Promise<HostReleaseManifest["nativeModules"][number]> => {
	const staged = packages.find((entry) => entry.name === name);
	if (!staged) throw new Error(`The host release does not contain ${name}.`);
	if (!(await hasNativeBinary(staged.path))) throw new Error(`${name} has no native binary for the target ABI.`);
	return { name, version: staged.version, nodeAbi, path: relative(outputRoot, staged.path) };
};

const validateDatabaseCompatibility = async (
	repositoryRoot: string,
	compatibility: HostReleaseCompatibility["database"],
) => {
	const journal: DrizzleJournal = JSON.parse(
		await readFile(join(repositoryRoot, "apps/server/drizzle/meta/_journal.json"), "utf8"),
	);
	const tags = journal.entries.map(({ tag }) => tag);
	for (const version of [compatibility.min, compatibility.max]) {
		if (!tags.includes(version)) throw new Error(`The database journal does not contain ${version}.`);
	}
	const latest = tags.at(-1)!;
	if (compatibility.max !== latest)
		throw new Error(`The database compatibility maximum must match the latest journal tag ${latest}.`);
	if (tags.indexOf(compatibility.min) > tags.indexOf(compatibility.max))
		throw new Error("The database compatibility minimum follows its maximum.");
};

export const buildHostRelease = async (input: BuildHostReleaseInput): Promise<HostReleaseManifest> => {
	if (input.target.platform !== process.platform || input.target.arch !== process.arch)
		throw new Error(
			`Build ${input.target.platform}-${input.target.arch} on its target. This process is ${process.platform}-${process.arch}.`,
		);
	await validateDatabaseCompatibility(input.repositoryRoot, input.compatibility.database);
	await mkdir(input.outputRoot);
	await mkdir(join(input.outputRoot, "bin"));
	const packages = await stagePackageClosure(input.repositoryRoot, input.outputRoot, workspacePaths);
	await cp(join(input.repositoryRoot, "apps/web/dist"), join(input.outputRoot, "apps/web/dist"), { recursive: true });
	await cp(input.bun.executable, join(input.outputRoot, "bin/bun"));
	await cp(input.node.executable, join(input.outputRoot, "bin/node"));
	await executable(
		join(input.outputRoot, "bin/trellis-server"),
		'#!/bin/sh\nroot=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexport TRELLIS_WEB_DIST="$root/apps/web/dist"\nexport TRELLIS_RUNTIME_NODE="$root/bin/node"\nexec "$root/bin/bun" "$root/apps/server/src/index.ts" "$@"\n',
	);
	await executable(
		join(input.outputRoot, "bin/trellis-runtime"),
		'#!/bin/sh\nroot=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexec "$root/bin/node" "$root/apps/runtime/dist/index.js" "$@"\n',
	);
	await executable(
		join(input.outputRoot, "bin/trellis"),
		'#!/bin/sh\nroot=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexec "$root/bin/bun" "$root/packages/cli/src/index.ts" "$@"\n',
	);
	await writeFile(join(input.outputRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" })}\n`);
	for (const path of entrypointPayloads) {
		const stat = await lstat(join(input.outputRoot, path));
		if (!stat.isFile()) throw new Error(`The host release entrypoint payload is not a file: ${path}`);
	}
	const nativeModules = await Promise.all(
		nativeModuleNames.map((name) => nativeModuleOf(packages, name, input.outputRoot, input.node.abi)),
	);
	const manifest = await writeHostReleaseManifest(input.outputRoot, {
		schemaVersion: HOST_RELEASE_MANIFEST_VERSION,
		version: input.version,
		sourceCommit: input.sourceCommit,
		target: input.target,
		compatibility: input.compatibility,
		runtimes: { bun: input.bun.version, node: input.node.version, nodeAbi: input.node.abi },
		entrypoints: {
			bun: "bin/bun",
			node: "bin/node",
			server: "bin/trellis-server",
			runtime: "bin/trellis-runtime",
			cli: "bin/trellis",
		},
		nativeModules,
	});
	const verification = await verifyHostRelease(input.outputRoot);
	if (!verification.ok)
		throw new Error(`Host release verification failed: ${JSON.stringify(verification.issues)}`);
	return manifest;
};
