import { dlopen, FFIType } from "bun:ffi";
import { closeSync, ftruncateSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";

// One process at a time owns a data home: the server, or a restore. Two
// PGlite instances on one data directory corrupt it, so every process that
// opens the database or swaps the directory takes this lock first.
//
// The lock is flock(2) on `<home>/trellis.lock`, held on an open file for the
// life of the owner. The kernel drops the lock when the owner exits or dies,
// so a lock file that a dead process left behind never blocks the next
// owner. The file text names the owner, so a refused process can say who
// holds the home.

export const LOCK_FILE = "trellis.lock";

export type HomeLockRole = "server" | "restore";

export type HomeLockHolder = { pid: number; role: HomeLockRole; port: number | null };

export type HomeLock = {
	// Writes the port the server bound, which a boot on port 0 learns only
	// after the bind.
	setPort: (port: number) => void;
	release: () => void;
};

const LOCK_EX = 2;
const LOCK_NB = 4;
const LOCK_UN = 8;

const LIBC = process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6";

type Flock = (fd: number, operation: number) => number;

// libc opens at the first lock, so an import of this module has no effect.
let flock: Flock | undefined;
const flockOf = (): Flock => {
	flock ??= dlopen(LIBC, { flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } }).symbols.flock;
	return flock;
};

const describe = (home: string, holder: HomeLockHolder) => {
	const port = holder.port === null ? "" : ` on port ${holder.port}`;
	return `${home} is in use by the trellis ${holder.role} with pid ${holder.pid}${port}. Stop that process first.`;
};

export class HomeLockedError extends Error {
	constructor(
		readonly home: string,
		readonly holder: HomeLockHolder,
	) {
		super(describe(home, holder));
		this.name = "HomeLockedError";
	}
}

// Takes the lock on `home`, or throws HomeLockedError that names the owner.
// The file opens in append mode, so a refused process never truncates the
// text of the owner.
export const lockHome = (home: string, role: HomeLockRole, port: number | null): HomeLock => {
	mkdirSync(home, { recursive: true });
	const path = join(home, LOCK_FILE);
	const fd = openSync(path, "a+");
	if (flockOf()(fd, LOCK_EX | LOCK_NB) !== 0) {
		closeSync(fd);
		throw new HomeLockedError(home, JSON.parse(readFileSync(path, "utf8")) as HomeLockHolder);
	}
	const write = (holder: HomeLockHolder) => {
		ftruncateSync(fd, 0);
		writeSync(fd, JSON.stringify(holder));
	};
	write({ pid: process.pid, role, port });
	return {
		setPort: (bound) => write({ pid: process.pid, role, port: bound }),
		release: () => {
			flockOf()(fd, LOCK_UN);
			closeSync(fd);
		},
	};
};
