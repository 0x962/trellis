import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { stageHostPackages } from "../stageHostPackages";

const repo = resolve(import.meta.dir, "../../../../..");
const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-staged-server-")));
const target = join(root, "host");
const home = join(root, "home");
let child: ReturnType<typeof Bun.spawn> | undefined;
try {
	const packages = await stageHostPackages(repo, target);
	await writeFile(join(target, "package.json"), '{"private":true,"type":"module"}');
	let links = 0;
	const extraFiles: { path: string; sha256: string }[] = [];
	async function inspect(directory: string): Promise<void> {
		for (const name of await readdir(directory)) {
			const path = join(directory, name);
			const stat = await lstat(path);
			if (stat.isSymbolicLink()) {
				assert(!relative(target, await realpath(path)).startsWith("../"), `External link: ${path}`);
				links++;
			} else if (stat.isDirectory()) await inspect(path);
			else if (path.startsWith(join(target, "integrations/"))) {
				const key = relative(target, path);
				const bytes = await readFile(path);
				assert.deepEqual(bytes, await readFile(join(repo, key)));
				assert(!/test|fixture|candidate|\.py$|\.patch$|\.tar$/.test(key), key);
				extraFiles.push({ path: key, sha256: createHash("sha256").update(bytes).digest("hex") });
			}
		}
	}
	await inspect(target);
	for (const path of [
		"integrations/langflow/release/index.ts",
		"integrations/langflow/package-probe/sidecarManifest.ts",
		"integrations/langflow/editor/protocol/protocol.ts",
		"integrations/langflow/editor/session/session.ts",
		"integrations/langflow/components/catalog/exportTemplates/frontend-templates.schema.v1.json",
	])
		assert(
			extraFiles.some((file) => file.path === path),
			path,
		);
	await mkdir(home);
	await mkdir(join(root, "bin"));
	await writeFile(join(root, "bin/gh"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
	await rename(join(target, "integrations"), join(root, "omitted-integrations"));
	const omitted = Bun.spawnSync([process.execPath, "-e", 'await import("./apps/server/src/index.ts")'], {
		cwd: target,
		env: { HOME: home, PATH: join(root, "bin") },
		timeout: 10000,
	});
	assert.notEqual(omitted.exitCode, 0);
	const omittedError = omitted.stderr.toString();
	assert(omittedError.includes("Cannot find module") && omittedError.includes("integrations/langflow"), omittedError);
	await rename(join(root, "omitted-integrations"), join(target, "integrations"));
	await copyFile(join(import.meta.dir, "stagedServerProbe.ts"), join(target, "probe.ts"));
	child = Bun.spawn([process.execPath, join(target, "probe.ts")], {
		cwd: target,
		env: {
			HOME: home,
			TMPDIR: root,
			PATH: join(root, "bin"),
			TRELLIS_HOME: home,
			TRELLIS_PORT: "0",
			TRELLIS_HOST: "127.0.0.1",
			TRELLIS_GH_BIN: join(root, "bin/gh"),
		},
		stdout: "pipe",
		stderr: "pipe",
		timeout: 120000,
	});
	const [stdout, stderr, exit] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	console.log(JSON.stringify({ packages, links, extraFiles, omittedError, stdout, stderr, exit }, null, 2));
	assert.equal(exit, 0);
	assert(stdout.includes("staged server passed"));
	assert.equal(await Bun.file(join(home, "runtime/runtime.sock")).exists(), false);
} finally {
	if (child && child.exitCode === null) {
		child.kill();
		await child.exited;
	}
	await rm(root, { recursive: true, force: true });
}
