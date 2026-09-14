import { existsSync } from "node:fs";
import { cp, mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

type Manifest = {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export const stagePackages = async (repo: string, target: string, workspacePaths: string[]): Promise<number> => {
	const copies = new Map<string, string>();
	const optionalPeers: { source: string; name: string; destination: string }[] = [];
	const workspaceDestinations = new Map(workspacePaths.map((path) => [join(repo, path), join(target, path)]));

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
			await link(dependency, join(output, "node_modules", name));
		}
		return output;
	};

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

	return copies.size;
};
