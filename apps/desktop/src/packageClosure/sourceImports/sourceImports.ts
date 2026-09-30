import { copyFile, mkdir, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { dirname, extname, join, relative } from "node:path";

export async function stageSourceImports(
	repo: string,
	target: string,
	workspacePaths: string[],
	entrypoints: string[],
	dependency: (from: string, name: string, destination: string) => Promise<void>,
): Promise<void> {
	const pending = entrypoints.map((path) => join(repo, path));
	const visited = new Set<string>();
	const linked = new Set<string>();
	const transpilers = {
		ts: new Bun.Transpiler({ loader: "ts" }),
		tsx: new Bun.Transpiler({ loader: "tsx" }),
		js: new Bun.Transpiler({ loader: "js" }),
		jsx: new Bun.Transpiler({ loader: "jsx" }),
	};
	while (pending.length > 0) {
		const source = pending.pop()!;
		if (visited.has(source)) continue;
		visited.add(source);
		const path = relative(repo, source);
		if (path.startsWith("../")) throw new Error(`Source import leaves the repository: ${source}`);
		const extra = !workspacePaths.some((workspace) => path.startsWith(`${workspace}/`));
		const output = join(target, path);
		if (extra) {
			await mkdir(dirname(output), { recursive: true });
			await copyFile(source, output);
		}
		if (!/\.[cm]?[jt]sx?$/.test(extname(source))) continue;
		const extension = extname(source);
		const loader = extension.endsWith("tsx")
			? "tsx"
			: extension.endsWith("jsx")
				? "jsx"
				: extension.endsWith("ts")
					? "ts"
					: "js";
		for (const imported of transpilers[loader].scanImports(await readFile(source, "utf8"))) {
			if (imported.path.startsWith(".")) {
				pending.push(Bun.resolveSync(imported.path, dirname(source)));
			} else if (extra && !isBuiltin(imported.path) && !imported.path.startsWith("bun:")) {
				const name = imported.path
					.split("/")
					.slice(0, imported.path.startsWith("@") ? 2 : 1)
					.join("/");
				const destination = join(dirname(output), "node_modules", name);
				if (linked.has(destination)) continue;
				await dependency(dirname(source), name, destination);
				linked.add(destination);
			}
		}
	}
}
