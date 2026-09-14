import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stagePackages } from "./packageClosure.ts";

test("the closure copies installed optional runtime packages and only required optional peers", async () => {
	const directory = await mkdtemp("/tmp/trl-closure-");
	const source = join(directory, "source");
	const target = join(directory, "target");
	const manifest = async (path: string, value: Record<string, unknown>) => {
		await mkdir(join(source, path), { recursive: true });
		await writeFile(join(source, path, "package.json"), JSON.stringify({ version: "1.0.0", ...value }));
	};
	try {
		await manifest("app", { name: "app", dependencies: { koffi: "1.0.0", database: "1.0.0" } });
		await manifest("node_modules/koffi", {
			name: "koffi",
			optionalDependencies: { "@platform/native": "1.0.0", "@platform/not-installed": "1.0.0" },
			peerDependencies: { database: "1.0.0", "dev-database": "1.0.0" },
			peerDependenciesMeta: { database: { optional: true }, "dev-database": { optional: true } },
		});
		await manifest("node_modules/@platform/native", { name: "@platform/native" });
		await writeFile(join(source, "node_modules/@platform/native/runtime.node"), "native fixture");
		await manifest("node_modules/database", { name: "database" });
		await manifest("node_modules/dev-database", { name: "dev-database" });
		expect(await stagePackages(source, target, ["app"])).toBe(4);
		const installed = join(target, "app/node_modules/koffi/node_modules");
		expect(await readFile(join(installed, "@platform/native/runtime.node"), "utf8")).toBe("native fixture");
		expect(existsSync(join(installed, "@platform/not-installed"))).toBe(false);
		expect(existsSync(join(installed, "database/package.json"))).toBe(true);
		expect(existsSync(join(installed, "dev-database"))).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
