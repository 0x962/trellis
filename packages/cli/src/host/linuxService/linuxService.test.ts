import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostReleaseManifest } from "@trellis/api";
import { foregroundLinuxService } from "./foregroundLinuxService.ts";
import { installLinuxService } from "./installLinuxService.ts";
import { linuxServicePaths } from "./paths.ts";
import { startLinuxService } from "./startLinuxService.ts";
import { statusLinuxService } from "./statusLinuxService.ts";
import { stopLinuxService } from "./stopLinuxService.ts";
import type { LinuxServiceDependencies } from "./types.ts";
import { uninstallLinuxService } from "./uninstallLinuxService.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const releaseFixture = async (root: string): Promise<string> => {
	const releaseRoot = join(root, "release");
	await mkdir(releaseRoot, { recursive: true });
	const manifest: HostReleaseManifest = {
		schemaVersion: 1,
		releaseId: "a".repeat(64),
		version: "1.0.0",
		sourceCommit: "0123456789abcdef",
		target: { platform: "linux", arch: "x64", libc: { family: "glibc", version: "2.28" } },
		compatibility: {
			api: { min: "1", max: "1" },
			runtime: { protocol: 13 },
			database: { min: "0126_current", max: "0126_current" },
		},
		runtimes: { bun: "1.3.13", node: "26.8.2", nodeAbi: "141" },
		entrypoints: {
			bun: "bin/bun",
			node: "bin/node",
			server: "bin/trellis-server",
			runtime: "bin/trellis-runtime",
			cli: "bin/trellis",
		},
		nativeModules: [],
		files: [],
	};
	await writeFile(join(releaseRoot, "release.json"), JSON.stringify(manifest));
	return releaseRoot;
};

test("installs independent user units and preserves data during uninstall", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-service-"));
	roots.push(root);
	const home = join(root, "home");
	const dataHome = join(root, "data");
	const releaseRoot = await releaseFixture(root);
	const calls: string[][] = [];
	const preflights: string[][] = [];
	const deps: LinuxServiceDependencies = {
		platform: "linux",
		arch: "x64",
		home,
		env: { PATH: "/usr/bin", SHELL: "/bin/bash" },
		randomToken: () => "secret-token",
		preflight: async (release, context) => {
			preflights.push([release, context]);
		},
		run: async (args) => {
			calls.push(args);
			const pid = args.at(-1)?.includes("runtime") ? 42 : 84;
			return { code: 0, stdout: `ActiveState=active\nSubState=running\nMainPID=${pid}\n`, stderr: "" };
		},
	};

	const installation = await installLinuxService({ releaseRoot, dataHome }, deps);
	const paths = linuxServicePaths(home);
	await writeFile(join(dataHome, "conversation"), "retained");

	expect(preflights).toEqual([[releaseRoot, "systemd"]]);
	expect(installation.dataHome).toBe(dataHome);
	expect(await readFile(paths.runtimeUnit, "utf8")).toContain("Delegate=yes");
	expect(await readFile(paths.runtimeUnit, "utf8")).toContain("bin/trellis-runtime");
	expect(await readFile(paths.runtimeUnit, "utf8")).toContain("runtime/runtime.sock");
	expect(await readFile(paths.runtimeUnit, "utf8")).toContain("UMask=0077");
	expect(await readFile(paths.hostUnit, "utf8")).toContain("Wants=trellis-runtime.service");
	expect(await readFile(paths.hostUnit, "utf8")).toContain("Requires=trellis-runtime.service");
	expect(await readFile(paths.hostUnit, "utf8")).not.toContain("PartOf=");
	expect((await stat(join(dataHome, "runtime"))).mode & 0o777).toBe(0o700);
	expect((await stat(paths.environment)).mode & 0o777).toBe(0o600);
	expect(calls).toEqual([
		["systemctl", "--user", "daemon-reload"],
		["systemctl", "--user", "enable", "trellis-runtime.service", "trellis-host.service"],
	]);

	calls.length = 0;
	await startLinuxService("all", deps);
	await stopLinuxService("host", deps);
	expect(calls).toEqual([
		["systemctl", "--user", "start", "trellis-runtime.service"],
		["systemctl", "--user", "start", "trellis-host.service"],
		["systemctl", "--user", "stop", "trellis-host.service"],
	]);

	const status = await statusLinuxService(deps);
	expect(status).toEqual({
		host: { activeState: "active", subState: "running", mainPid: 84 },
		runtime: { activeState: "active", subState: "running", mainPid: 42 },
	});

	await uninstallLinuxService(deps);
	expect(await readFile(join(dataHome, "conversation"), "utf8")).toBe("retained");
});

test("returns separate foreground commands for the runtime and host", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-service-"));
	roots.push(root);
	const releaseRoot = await releaseFixture(root);
	const deps: Pick<
		LinuxServiceDependencies,
		"platform" | "arch" | "home" | "env" | "preflight"
	> = {
		platform: "linux" as const,
		arch: "x64",
		home: join(root, "home"),
		env: { PATH: "/usr/bin", SHELL: "/bin/bash" },
		preflight: async (_release, context) => {
			expect(context).toBe("foreground");
		},
	};

	const runtime = await foregroundLinuxService({ releaseRoot, service: "runtime" }, deps);
	const host = await foregroundLinuxService(
		{ releaseRoot, service: "host", authToken: "secret-token" },
		deps,
	);

	expect(runtime.executable).toBe(join(releaseRoot, "bin/trellis-runtime"));
	expect(runtime.args).toEqual(["--home", join(root, "home/.trellis/runtime")]);
	expect(host.executable).toBe(join(releaseRoot, "bin/trellis-server"));
	expect(host.env.TRELLIS_AUTH_TOKEN).toBe("secret-token");
	expect(host.env.TRELLIS_RUNTIME_NODE).toBe(join(releaseRoot, "bin/node"));
});
