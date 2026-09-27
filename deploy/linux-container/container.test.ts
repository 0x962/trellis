import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContainerLifecycle, type ManagedProcess } from "./src/lifecycle.ts";
import { cgroupRoot, filesystemForPath } from "./src/preflight.ts";
import { containerPaths, prepareContainerState } from "./src/state.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("keeps the installation identity and token in owner-only persistent metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-container-"));
	roots.push(root);
	const first = await prepareContainerState(root, 4521, "a".repeat(64));
	const second = await prepareContainerState(root, 5521, "b".repeat(64));
	expect(second.metadata.installationId).toBe(first.metadata.installationId);
	expect(second.authToken).toBe(first.authToken);
	expect(second.metadata.forwardedPort).toBe(5521);
	expect(second.metadata.releaseId).toBe("b".repeat(64));
	expect((await stat(second.paths.bootstrap)).mode & 0o777).toBe(0o600);
	expect((await stat(second.paths.authToken)).mode & 0o777).toBe(0o600);
	expect((await stat(second.paths.container)).mode & 0o777).toBe(0o700);
});

test("removes a stale replacement marker only after a new supervisor starts", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-container-"));
	roots.push(root);
	const paths = containerPaths(root);
	await mkdir(paths.container, { recursive: true });
	await writeFile(paths.replacementReady, "ready");
	await prepareContainerState(root, 4521, "a".repeat(64));
	expect(await Bun.file(paths.replacementReady).exists()).toBe(false);
});

test("restarts the host without a runtime restart and marks an explicit full stop", async () => {
	const processes: Record<"runtime" | "host", FakeProcess[]> = { runtime: [], host: [] };
	const states: unknown[] = [];
	let replacementReady = false;
	let exitCode: number | null = null;
	const lifecycle = new ContainerLifecycle({
		spawn: (service) => {
			const child = new FakeProcess(service === "runtime" ? 10 : 20 + processes.host.length);
			processes[service].push(child);
			return child;
		},
		waitForRuntime: async () => {},
		writeState: async (state) => {
			states.push(state);
		},
		markReplacementReady: async () => {
			replacementReady = true;
		},
		exit: (code) => {
			exitCode = code;
		},
	});
	await lifecycle.start();
	await lifecycle.restartHost();
	expect(processes.runtime).toHaveLength(1);
	expect(processes.host).toHaveLength(2);
	expect(processes.host[0]?.signals).toEqual(["SIGTERM"]);
	await lifecycle.stopForReplacement();
	expect(processes.runtime[0]?.signals).toEqual(["SIGTERM"]);
	expect(processes.host[1]?.signals).toEqual(["SIGTERM"]);
	expect(replacementReady).toBe(true);
	expect(exitCode).toBe(0);
	expect(states).toHaveLength(3);
});

test("resolves a delegated cgroup mount and the most specific data filesystem", () => {
	const mountInfo = [
		"20 18 0:19 / / rw - ext4 /dev/vda rw",
		"21 20 0:20 /delegated /sys/fs/cgroup rw - cgroup2 cgroup rw",
		"22 20 0:21 /data /var/lib/trellis rw - xfs /dev/vdb rw",
	].join("\n");
	expect(cgroupRoot("0::/delegated/trellis", mountInfo)).toBe("/sys/fs/cgroup/trellis");
	expect(filesystemForPath("/var/lib/trellis/runtime", mountInfo)).toBe("xfs");
});

test("pins both glibc 2.28 image inputs and forbids privileged container access", async () => {
	const root = import.meta.dir;
	const build = await readFile(join(root, "build-image.sh"), "utf8");
	const manager = await readFile(join(root, "trellis-container.sh"), "utf8");
	const dockerfile = await readFile(join(root, "Dockerfile"), "utf8");
	for (const digest of [
		"sha256:af5fbd460188a87059557422b2c00978f488ac6bc6b78d63a02e2fad040d7733",
		"sha256:55ddcbe11a7bf1696f67ce3b2ffcc6d58b3d33007be03bc372d61fc147a92015",
		"sha256:2b9bf75c2d49d9e774b4301cc72103bf6474f9d0f917ad3dd5e15c40859a451c",
		"sha256:ab6c9311540baa3b6a0986533aff625a25d10976534efed25f066ae14cff3c25",
	])
		expect(build).toContain(digest);
	expect(build).toContain("registry.access.redhat.com/ubi8/nodejs-24-minimal");
	expect(dockerfile).toContain('LABEL io.trellis.glibc.version="2.28"');
	expect(manager).toContain("--publish \"127.0.0.1:$port:4521\"");
	expect(manager).toContain("--cap-drop ALL");
	expect(manager).toContain("--security-opt no-new-privileges");
	expect(manager).not.toContain("--privileged");
	expect(manager).not.toContain("docker.sock");
});

class FakeProcess implements ManagedProcess {
	readonly signals: NodeJS.Signals[] = [];
	private finish!: (code: number) => void;
	readonly exited = new Promise<number>((resolve) => {
		this.finish = resolve;
	});

	constructor(readonly pid: number) {}

	kill(signal: NodeJS.Signals) {
		this.signals.push(signal);
		this.finish(0);
	}
}
