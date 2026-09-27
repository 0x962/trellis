import { existsSync } from "node:fs";
import { cp, mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

type PackageManifest = {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export type StagedPackage = { name: string; version: string; path: string };

export const stagePackageClosure = async (
	repositoryRoot: string,
	targetRoot: string,
	workspacePaths: string[],
): Promise<StagedPackage[]> => {
	const copies = new Map<string, StagedPackage>();
	const optionalPeers: { source: string; name: string; destination: string }[] = [];
	const workspaceDestinations = new Map(
		workspacePaths.map((path) => [join(repositoryRoot, path), join(targetRoot, path)]),
	);

	const packageAt = async (from: string, name: string, optional = false): Promise<string | undefined> => {
		let directory = from;
		while (true) {
			const path = join(directory, "node_modules", name);
			if (existsSync(join(path, "package.json"))) return realpath(path);
			const parent = dirname(directory);
			if (parent === directory) {
				if (optional) return;
				throw new Error(`Cannot resolve ${name} from ${from}. Run bun install first.`);
			}
			directory = parent;
		}
	};

	const link = async (source: string, destination: string) => {
		await mkdir(dirname(destination), { recursive: true });
		await symlink(relative(dirname(destination), source), destination);
	};

	const copyPackage = async (source: string, destination?: string): Promise<StagedPackage> => {
		const canonical = await realpath(source);
		const existing = copies.get(canonical);
		if (existing) return existing;
		const manifest: PackageManifest = JSON.parse(await readFile(join(canonical, "package.json"), "utf8"));
		if (manifest.name === "electron") throw new Error("A standalone host release cannot contain Electron.");
		const output =
			destination ??
			workspaceDestinations.get(canonical) ??
			join(targetRoot, "modules", `${manifest.name.replaceAll("/", "_")}@${manifest.version}_${copies.size}`);
		const staged = { name: manifest.name, version: manifest.version, path: output };
		copies.set(canonical, staged);
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
		for (const name of Object.keys({
			...manifest.peerDependencies,
			...manifest.dependencies,
			...manifest.optionalDependencies,
		})) {
			if (
				!manifest.dependencies?.[name] &&
				!manifest.optionalDependencies?.[name] &&
				manifest.peerDependenciesMeta?.[name]?.optional === true
			) {
				optionalPeers.push({ source: canonical, name, destination: join(output, "node_modules", name) });
				continue;
			}
			const path = await packageAt(canonical, name, Boolean(manifest.optionalDependencies?.[name]));
			if (!path) continue;
			const dependency = await copyPackage(path);
			await link(dependency.path, join(output, "node_modules", name));
		}
		return staged;
	};

	for (const path of workspacePaths) await copyPackage(join(repositoryRoot, path), join(targetRoot, path));
	for (const peer of optionalPeers) {
		let directory = peer.source;
		while (true) {
			const candidate = join(directory, "node_modules", peer.name);
			if (existsSync(join(candidate, "package.json"))) {
				const dependency = copies.get(await realpath(candidate));
				if (dependency) await link(dependency.path, peer.destination);
				break;
			}
			const parent = dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	}

	return [...copies.values()];
};
