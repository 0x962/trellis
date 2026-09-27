import { accessSync, constants, mkdirSync, readFileSync, readdirSync, rmdirSync, watch, writeFileSync } from "node:fs";
import { createLinuxCgroupController } from "./cgroup.ts";
import { logLinuxLifecycle } from "./logLinuxLifecycle.ts";

const sleepState = new Int32Array(new SharedArrayBuffer(4));

export const linuxCgroupController = createLinuxCgroupController({
	readFile: (path) => readFileSync(path, "utf8"),
	writeFile: (path, value) => writeFileSync(path, value),
	makeDirectory(path, recursive) {
		mkdirSync(path, { recursive });
	},
	listDirectories: (path) =>
		readdirSync(path, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name),
	removeDirectory: (path) => rmdirSync(path),
	watchFile(path, change, failure) {
		const watcher = watch(path, { persistent: false }, change);
		watcher.once("error", failure);
		return watcher;
	},
	setTimer: setTimeout,
	clearTimer: clearTimeout,
	now: () => performance.now(),
	waitSync(milliseconds) {
		Atomics.wait(sleepState, 0, 0, milliseconds);
	},
	launch: {
		executable: process.execPath,
		canExecute(path) {
			try {
				accessSync(path, constants.X_OK);
				return true;
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code === "EACCES" || code === "ENOENT" || code === "ENOTDIR") return false;
				throw error;
			}
		},
	},
	log: logLinuxLifecycle,
});
