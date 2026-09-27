import { expect, test } from "bun:test";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import { createLinuxCgroupController, linuxCgroupRoot, type LinuxCgroupOperations } from "./cgroup.ts";

const spec: LaunchSpec = {
	id: "attempt-one",
	command: "agent",
	args: ["--work"],
	cwd: "/work",
	mode: "stdio",
};

function fixture() {
	const files = new Map<string, string>([
		["/proc/self/cgroup", "0::/runtime.scope\n"],
		["/proc/self/mountinfo", "36 25 0:32 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n"],
	]);
	const directories = new Set<string>();
	const writes: { path: string; value: string }[] = [];
	let change = () => {};
	let failure = (_error: Error) => {};
	let now = 0;
	const operations: LinuxCgroupOperations = {
		readFile(path) {
			const value = files.get(path);
			if (value === undefined) throw Object.assign(new Error(`missing ${path}`), { code: "ENOENT" });
			return value;
		},
		writeFile(path, value) {
			writes.push({ path, value });
			files.set(path, value);
		},
		makeDirectory(path, recursive) {
			if (!recursive && directories.has(path)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
			directories.add(path);
			if (!recursive) {
				files.set(`${path}/cgroup.events`, "populated 0\nfrozen 0\n");
				files.set(`${path}/cgroup.procs`, "");
			}
		},
		listDirectories(path) {
			const prefix = `${path}/`;
			return [...directories]
				.filter((entry) => entry.startsWith(prefix) && !entry.slice(prefix.length).includes("/"))
				.map((entry) => entry.slice(prefix.length));
		},
		removeDirectory(path) {
			directories.delete(path);
		},
		watchFile(_path, listener, onError) {
			change = listener;
			failure = onError;
			return { close: () => {} };
		},
		setTimer: (listener, milliseconds) => setTimeout(listener, milliseconds),
		clearTimer,
		now: () => now,
		waitSync(milliseconds) {
			now += milliseconds;
		},
		launch: {
			executable: "/release/bin/node",
			canExecute: (path) => path === "/bin/agent",
		},
	};
	return {
		files,
		directories,
		writes,
		operations,
		change: () => change(),
		failure: (error: Error) => failure(error),
	};
}

test("the cgroup path follows the delegated cgroup v2 mount", () => {
	expect(
		linuxCgroupRoot(
			"0::/user.slice/runtime.scope\n",
			"36 25 0:32 /user.slice /sys/fs/cgroup/user rw - cgroup2 cgroup rw\n",
		),
	).toBe("/sys/fs/cgroup/user/runtime.scope");
});

test("the launch wrapper joins a frozen attempt cgroup before it executes the payload", () => {
	const state = fixture();
	const controller = createLinuxCgroupController(state.operations);
	const attempt = controller.prepare("attempt-one", { ...spec, env: { PATH: "/bin" } });
	expect(state.writes).toContainEqual({ path: `${attempt.path}/cgroup.freeze`, value: "1" });
	expect(attempt.spec.command).toBe("/release/bin/node");
	expect(attempt.spec.args.at(-2)).toBe("/bin/agent");
	expect(attempt.spec.args.at(-1)).toBe("--work");
	expect(attempt.spec.args.join(" ")).toContain(`${attempt.path}/cgroup.procs`);
	state.files.set(`${attempt.path}/cgroup.procs`, "42\n");
	attempt.register(42);
	expect(state.writes.at(-1)).toEqual({ path: `${attempt.path}/cgroup.freeze`, value: "0" });
});

test("cgroup.kill waits for concurrent descendants before it removes the cgroup tree", async () => {
	const state = fixture();
	const controller = createLinuxCgroupController(state.operations);
	const attempt = controller.prepare("attempt-one", { ...spec, env: { PATH: "/bin" } });
	state.files.set(`${attempt.path}/cgroup.procs`, "42\n");
	state.files.set(`${attempt.path}/cgroup.events`, "populated 1\nfrozen 0\n");
	attempt.register(42);
	state.directories.add(`${attempt.path}/child`);
	state.directories.add(`${attempt.path}/child/grandchild`);
	const stopped = controller.stop(42);
	expect(state.writes).toContainEqual({ path: `${attempt.path}/cgroup.kill`, value: "1" });
	expect(state.directories.has(attempt.path)).toBe(true);
	state.files.set(`${attempt.path}/cgroup.events`, "populated 0\nfrozen 0\n");
	state.change();
	await stopped;
	expect(state.directories.has(attempt.path)).toBe(false);
	expect(state.directories.has(`${attempt.path}/child`)).toBe(false);
});

test("a failed cgroup kill retains the attempt for a later stop", async () => {
	const state = fixture();
	let failKill = true;
	const writeFile = state.operations.writeFile;
	state.operations.writeFile = (path, value) => {
		if (path.endsWith("/cgroup.kill") && failKill) throw Object.assign(new Error("denied"), { code: "EPERM" });
		writeFile(path, value);
	};
	const controller = createLinuxCgroupController(state.operations);
	const attempt = controller.prepare("attempt-one", { ...spec, env: { PATH: "/bin" } });
	state.files.set(`${attempt.path}/cgroup.procs`, "42\n");
	attempt.register(42);
	await expect(controller.stop(42)).rejects.toThrow("denied");
	failKill = false;
	await controller.stop(42);
	expect(state.directories.has(attempt.path)).toBe(false);
});

test("a reused PID cannot replace an attempt cgroup", () => {
	const state = fixture();
	const controller = createLinuxCgroupController(state.operations);
	const first = controller.prepare("attempt-one", { ...spec, env: { PATH: "/bin" } });
	state.files.set(`${first.path}/cgroup.procs`, "42\n");
	first.register(42);
	const second = controller.prepare("attempt-two", { ...spec, id: "attempt-two", env: { PATH: "/bin" } });
	state.files.set(`${second.path}/cgroup.procs`, "42\n");
	expect(() => second.register(42)).toThrow("Process 42 already has an attempt cgroup");
	expect(state.writes).toContainEqual({ path: `${second.path}/cgroup.kill`, value: "1" });
});

test("a duplicate attempt cannot reuse an existing cgroup", () => {
	const state = fixture();
	const controller = createLinuxCgroupController(state.operations);
	controller.prepare("attempt-one", { ...spec, env: { PATH: "/bin" } });
	expect(() => controller.prepare("attempt-one", { ...spec, env: { PATH: "/bin" } })).toThrow("exists");
});
