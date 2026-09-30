import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stagePackages } from "./packageClosure";

test("copies transitive source and JSON bytes with internal dependency links", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-package-closure-")));
	const repo = join(root, "repo");
	const target = join(root, "staged");
	const files: Record<string, string> = {
		"apps/server/package.json":
			'{"name":"@trellis/server","version":"1","dependencies":{"@trellis/api":"workspace:*"}}',
		"apps/server/index.ts": 'export { value } from "../../integrations/runtime";',
		"packages/api/package.json": '{"name":"@trellis/api","version":"1","exports":"./index.ts"}',
		"packages/api/index.ts": 'export const api = "owned source";',
		"integrations/runtime/index.ts": 'export { value } from "./value";',
		"integrations/runtime/value.ts":
			'import { api } from "@trellis/api"; import json from "./value.json"; const identity = <T>(input: T) => input; export const value = identity([api, json]);',
		"integrations/runtime/value.json": '{ "preserve": "original bytes" }\n',
		"integrations/runtime/unrelated.test.ts": 'throw new Error("must not ship");',
		"integrations/runtime/candidate/image.tar": "must not ship",
	};
	try {
		for (const [path, body] of Object.entries(files)) {
			await mkdir(dirname(join(repo, path)), { recursive: true });
			await writeFile(join(repo, path), body);
		}
		await mkdir(join(repo, "node_modules/@trellis"), { recursive: true });
		await symlink(join(root, "wrong-checkout"), join(repo, "node_modules/@trellis/api"));
		await stagePackages(repo, target, ["apps/server", "packages/api"], ["apps/server/index.ts"]);
		for (const path of [
			"integrations/runtime/index.ts",
			"integrations/runtime/value.ts",
			"integrations/runtime/value.json",
		])
			expect(await readFile(join(target, path), "utf8")).toBe(files[path]!);
		expect(await realpath(join(target, "integrations/runtime/node_modules/@trellis/api"))).toBe(
			join(target, "packages/api"),
		);
		expect(await realpath(join(target, "apps/server/node_modules/@trellis/api"))).toBe(join(target, "packages/api"));
		expect(await Bun.file(join(target, "integrations/runtime/unrelated.test.ts")).exists()).toBe(false);
		expect(await Bun.file(join(target, "integrations/runtime/candidate/image.tar")).exists()).toBe(false);
		const child = Bun.spawn(
			[process.execPath, "-e", 'import {value} from "./apps/server/index.ts"; console.log(JSON.stringify(value))'],
			{ cwd: target, stdout: "pipe", stderr: "pipe" },
		);
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stdout).text()).toContain('"owned source"');
		await rm(join(repo, "integrations/runtime/value.json"));
		await expect(
			stagePackages(repo, join(root, "incomplete"), ["apps/server", "packages/api"], ["apps/server/index.ts"]),
		).rejects.toThrow();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
