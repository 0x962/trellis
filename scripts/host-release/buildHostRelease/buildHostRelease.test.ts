import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOST_RELEASE_SUPPORT, type HostReleaseTarget } from "@trellis/api";
import { buildHostRelease } from "./buildHostRelease.ts";
import { verifyHostRelease } from "../manifest/index.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const packageFixture = async (
	repositoryRoot: string,
	path: string,
	manifest: { name: string; version?: string; dependencies?: Record<string, string> },
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

describe("buildHostRelease", () => {
	test("builds and verifies a host-only executable closure", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "trellis-host-release-"));
		roots.push(fixture);
		const repositoryRoot = join(fixture, "repository");
		const outputRoot = join(fixture, "release");
		await mkdir(join(repositoryRoot, "apps/server/drizzle/meta"), { recursive: true });
		await writeFile(
			join(repositoryRoot, "apps/server/drizzle/meta/_journal.json"),
			JSON.stringify({ entries: [{ tag: "0126_material_mandrill" }] }),
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
		const target: HostReleaseTarget =
			process.platform === "linux"
				? {
						platform: "linux",
						arch: process.arch as "x64" | "arm64",
						libc: { family: "glibc", version: HOST_RELEASE_SUPPORT.linux.libc.minVersion },
					}
				: { platform: "darwin", arch: process.arch as "x64" | "arm64", libc: null };

		const manifest = await buildHostRelease({
			repositoryRoot,
			outputRoot,
			version: "1.0.0",
			sourceCommit: "0123456789abcdef",
			target,
			compatibility: {
				api: { min: "1", max: "1" },
				runtime: { protocol: 13 },
				database: { min: "0126_material_mandrill", max: "0126_material_mandrill" },
			},
			bun: { executable: bun, version: "1.3.13" },
			node: { executable: node, version: "26.8.2", abi: "141" },
		});

		expect(manifest.entrypoints).toEqual({
			bun: "bin/bun",
			node: "bin/node",
			server: "bin/trellis-server",
			runtime: "bin/trellis-runtime",
			cli: "bin/trellis",
		});
		expect(manifest.nativeModules.map(({ name }) => name)).toEqual(["node-pty", "fs-ext", "koffi"]);
		expect(manifest.files.some(({ path }) => path.includes("electron"))).toBe(false);
		expect(await verifyHostRelease(outputRoot)).toMatchObject({ ok: true, issues: [] });
	});

	test("rejects a stale database compatibility maximum", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "trellis-host-release-"));
		roots.push(fixture);
		const repositoryRoot = join(fixture, "repository");
		await mkdir(join(repositoryRoot, "apps/server/drizzle/meta"), { recursive: true });
		await writeFile(
			join(repositoryRoot, "apps/server/drizzle/meta/_journal.json"),
			JSON.stringify({ entries: [{ tag: "0125_previous" }, { tag: "0126_current" }] }),
		);
		const target: HostReleaseTarget =
			process.platform === "linux"
				? {
						platform: "linux",
						arch: process.arch as "x64" | "arm64",
						libc: { family: "glibc", version: HOST_RELEASE_SUPPORT.linux.libc.minVersion },
					}
				: { platform: "darwin", arch: process.arch as "x64" | "arm64", libc: null };

		await expect(
			buildHostRelease({
				repositoryRoot,
				outputRoot: join(fixture, "release"),
				version: "1.0.0",
				sourceCommit: "0123456789abcdef",
				target,
				compatibility: {
					api: { min: "1", max: "1" },
					runtime: { protocol: 13 },
					database: { min: "0125_previous", max: "0125_previous" },
				},
				bun: { executable: join(fixture, "bun"), version: "1.3.13" },
				node: { executable: join(fixture, "node"), version: "26.8.2", abi: "141" },
			}),
		).rejects.toThrow("The database compatibility maximum must match the latest journal tag 0126_current.");
	});

	test("rejects a release without the runtime entrypoint payload", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "trellis-host-release-"));
		roots.push(fixture);
		const repositoryRoot = join(fixture, "repository");
		await mkdir(join(repositoryRoot, "apps/server/drizzle/meta"), { recursive: true });
		await writeFile(
			join(repositoryRoot, "apps/server/drizzle/meta/_journal.json"),
			JSON.stringify({ entries: [{ tag: "0126_material_mandrill" }] }),
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
		await mkdir(join(repositoryRoot, "apps/web/dist"), { recursive: true });
		await writeFile(join(repositoryRoot, "apps/web/dist/index.html"), "<!doctype html>");
		for (const name of ["node-pty", "fs-ext", "koffi"]) await nativePackageFixture(repositoryRoot, name);
		const bun = join(fixture, "bun");
		const node = join(fixture, "node");
		await writeFile(bun, "bun", { mode: 0o755 });
		await writeFile(node, "node", { mode: 0o755 });
		const target: HostReleaseTarget =
			process.platform === "linux"
				? {
						platform: "linux",
						arch: process.arch as "x64" | "arm64",
						libc: { family: "glibc", version: HOST_RELEASE_SUPPORT.linux.libc.minVersion },
					}
				: { platform: "darwin", arch: process.arch as "x64" | "arm64", libc: null };

		await expect(
			buildHostRelease({
				repositoryRoot,
				outputRoot: join(fixture, "release"),
				version: "1.0.0",
				sourceCommit: "0123456789abcdef",
				target,
				compatibility: {
					api: { min: "1", max: "1" },
					runtime: { protocol: 13 },
					database: { min: "0126_material_mandrill", max: "0126_material_mandrill" },
				},
				bun: { executable: bun, version: "1.3.13" },
				node: { executable: node, version: "26.8.2", abi: "141" },
			}),
		).rejects.toThrow("apps/runtime/dist/index.js");
	});
});
