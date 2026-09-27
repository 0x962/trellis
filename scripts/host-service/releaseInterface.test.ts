import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOST_RELEASE_SUPPORT } from "@trellis/api";
import { installLinuxService, linuxServicePaths } from "../../packages/cli/src/host/linuxService/index.ts";
import { buildHostRelease, type BuildHostReleaseInput } from "../host-release/index.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const packageFixture = async (
	repositoryRoot: string,
	path: string,
	manifest: { name: string; dependencies?: Record<string, string> },
) => {
	const root = join(repositoryRoot, path);
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.0.0", ...manifest }));
	await writeFile(join(root, "src/index.ts"), "export {};\n");
};

const nativePackageFixture = async (repositoryRoot: string, name: string) => {
	const root = join(repositoryRoot, "node_modules", name);
	await mkdir(join(root, "build/Release"), { recursive: true });
	await writeFile(join(root, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
	await writeFile(join(root, "build/Release/addon.node"), "target ABI");
};

describe("Linux host service release interface", () => {
	if (process.platform !== "linux") return;
	test("installs units from the public host release builder", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "trellis-host-service-release-"));
		roots.push(fixture);
		const repositoryRoot = join(fixture, "repository");
		const outputRoot = join(fixture, "release");
		await mkdir(join(repositoryRoot, "apps/server/drizzle/meta"), { recursive: true });
		await writeFile(
			join(repositoryRoot, "apps/server/drizzle/meta/_journal.json"),
			JSON.stringify({ entries: [{ tag: "0126_current" }] }),
		);
		for (const [path, name] of [
			["apps/server", "@trellis/server"],
			["packages/api", "@trellis/api"],
			["packages/cli", "@trellis/cli"],
			["packages/runtime-protocol", "@trellis/runtime-protocol"],
		] as const)
			await packageFixture(repositoryRoot, path, { name });
		await packageFixture(repositoryRoot, "apps/runtime", {
			name: "@trellis/runtime",
			dependencies: { "node-pty": "1.0.0", "fs-ext": "1.0.0", koffi: "1.0.0" },
		});
		await mkdir(join(repositoryRoot, "apps/runtime/dist"), { recursive: true });
		await writeFile(join(repositoryRoot, "apps/runtime/dist/index.js"), "export {};\n");
		await mkdir(join(repositoryRoot, "apps/web/dist"), { recursive: true });
		await writeFile(join(repositoryRoot, "apps/web/dist/index.html"), "<!doctype html>");
		for (const name of ["node-pty", "fs-ext", "koffi"]) await nativePackageFixture(repositoryRoot, name);
		const bun = join(fixture, "bun");
		const node = join(fixture, "node");
		await writeFile(bun, "bun", { mode: 0o755 });
		await writeFile(node, "node", { mode: 0o755 });
		const buildInput: BuildHostReleaseInput = {
			repositoryRoot,
			outputRoot,
			version: "1.0.0",
			sourceCommit: "0123456789abcdef",
			target: {
				platform: "linux",
				arch: process.arch as "x64" | "arm64",
				libc: { family: "glibc", version: HOST_RELEASE_SUPPORT.linux.libc.minVersion },
			},
			compatibility: {
				api: { min: "1", max: "1" },
				runtime: { protocol: 13 },
				database: { min: "0126_current", max: "0126_current" },
			},
			bun: { executable: bun, version: "1.3.13" },
			node: { executable: node, version: "26.8.2", abi: "141" },
		};
		const manifest = await buildHostRelease(buildInput);
		const home = join(fixture, "home");
		await installLinuxService(
			{ releaseRoot: outputRoot, dataHome: join(fixture, "data") },
			{
				platform: "linux",
				arch: process.arch,
				home,
				env: { PATH: "/usr/bin", SHELL: "/bin/sh" },
				randomToken: () => "secret-token",
				preflight: async () => {},
				run: async () => ({ code: 0, stdout: "", stderr: "" }),
			},
		);

		const unit = await readFile(linuxServicePaths(home).hostUnit, "utf8");
		expect(unit).toContain(join(outputRoot, manifest.entrypoints.server));
	});
});
