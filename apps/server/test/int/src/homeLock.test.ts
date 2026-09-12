import { originDir } from "../../../../../test/originDir.ts";
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { freshHome } from "../../helpers/home.ts";
import { HomeLockedError, LOCK_FILE, lockHome } from "../../../src/homeLock.ts";

// One process at a time owns a data home. The owner holds an exclusive lock
// on `<home>/trellis.lock` for its whole life, and the file names its pid,
// its role, and its port. The kernel drops the lock when the owner dies, so a
// file left by a dead process never blocks the next owner.

const holders: Subprocess[] = [];
afterEach(async () => {
	for (const holder of holders.splice(0)) {
		holder.kill("SIGKILL");
		await holder.exited;
	}
});

const lockFile = (home: string) => join(home, LOCK_FILE);

const holderOf = (home: string) => JSON.parse(readFileSync(lockFile(home), "utf8"));

// A pid that no process has: a child that ran and exited.
const deadPid = async () => {
	const child = Bun.spawn(["true"]);
	await child.exited;
	return child.pid;
};

// A second process that takes the lock and holds it until it is killed.
const holdInChild = async (home: string) => {
	const script = `
		import { lockHome } from ${JSON.stringify(join(originDir(import.meta.dir), "homeLock.ts"))};
		lockHome(process.argv[1], "server", 4777);
		console.log("locked");
		setInterval(() => {}, 1000);
	`;
	const child = Bun.spawn([process.execPath, "-e", script, home], { stdout: "pipe", stderr: "inherit" });
	holders.push(child);
	const reader = child.stdout.getReader();
	const { value } = await reader.read();
	expect(new TextDecoder().decode(value)).toContain("locked");
	return child;
};

describe("lockHome", () => {
	test("the lock file names the pid, the role, and the port of the holder", () => {
		const home = freshHome();
		const lock = lockHome(home, "server", 4600);

		expect(holderOf(home)).toEqual({ pid: process.pid, role: "server", port: 4600 });
		lock.release();
	});

	test("setPort writes the port the server bound", () => {
		const home = freshHome();
		const lock = lockHome(home, "server", 0);

		lock.setPort(51234);

		expect(holderOf(home)).toEqual({ pid: process.pid, role: "server", port: 51234 });
		lock.release();
	});

	test("a second lock on a held home throws and names the holder pid and port", () => {
		const home = freshHome();
		const lock = lockHome(home, "server", 4600);

		let thrown: unknown;
		try {
			lockHome(home, "restore", null);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(HomeLockedError);
		expect((thrown as HomeLockedError).holder).toEqual({ pid: process.pid, role: "server", port: 4600 });
		expect((thrown as Error).message).toContain(`pid ${process.pid}`);
		expect((thrown as Error).message).toContain("port 4600");
		expect((thrown as Error).message).toContain(home);
		expect(holderOf(home)).toEqual({ pid: process.pid, role: "server", port: 4600 });
		lock.release();
	});

	test("a lock that another live process holds refuses and names that process", async () => {
		const home = freshHome();
		const child = await holdInChild(home);

		expect(() => lockHome(home, "server", 0)).toThrow(`pid ${child.pid}`);
	});

	test("the lock of a killed holder is taken over", async () => {
		const home = freshHome();
		const child = await holdInChild(home);
		child.kill("SIGKILL");
		await child.exited;

		const lock = lockHome(home, "server", 4601);

		expect(holderOf(home)).toEqual({ pid: process.pid, role: "server", port: 4601 });
		lock.release();
	});

	test("a stale lock file from a dead pid is taken over", async () => {
		const home = freshHome();
		writeFileSync(lockFile(home), JSON.stringify({ pid: await deadPid(), role: "server", port: 4521 }));

		const lock = lockHome(home, "server", 4602);

		expect(holderOf(home)).toEqual({ pid: process.pid, role: "server", port: 4602 });
		lock.release();
	});

	test("release lets the next owner in", () => {
		const home = freshHome();
		lockHome(home, "restore", null).release();

		const lock = lockHome(home, "server", 4603);

		expect(holderOf(home)).toEqual({ pid: process.pid, role: "server", port: 4603 });
		lock.release();
	});

	test("the lock creates a data home that does not exist yet", () => {
		const home = join(freshHome(), "nested", "home");

		const lock = lockHome(home, "server", 4604);

		expect(holderOf(home).pid).toBe(process.pid);
		lock.release();
	});
});
