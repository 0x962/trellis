import { dlopen, FFIType } from "bun:ffi";
import { closeSync, constants, existsSync, lstatSync, openSync } from "node:fs";
import { join } from "node:path";

let flock: ((fd: number, operation: number) => number) | undefined;
export const readOnlyLocks = (home: string) => {
	flock ??= dlopen(process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6", {
		flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
	}).symbols.flock;
	const runtime = join(home, "runtime");
	if (existsSync(runtime) && lstatSync(runtime).isSymbolicLink())
		throw new Error(`Runtime directory ${runtime} must not be a symlink.`);
	const held: number[] = [];
	const paths = [join(home, "trellis.lock"), join(home, "runtime", "runtime.lock")];
	if (!existsSync(paths[0]!))
		throw new Error(`Source ${home} has no trellis.lock. A stopped Trellis host must have created its ownership file.`);
	try {
		for (const path of paths) {
			if (!existsSync(path)) continue;
			const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
			held.push(fd);
			if (flock(fd, 2 | 4) !== 0)
				throw new Error(`A live owner holds the lock ${path}. Stop that host or runtime before import or rollback.`);
		}
	} catch (error) {
		for (const fd of held) closeSync(fd);
		throw error;
	}
	return () => {
		for (const fd of held) closeSync(fd);
	};
};
