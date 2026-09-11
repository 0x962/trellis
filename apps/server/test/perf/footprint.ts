import { dlopen, FFIType, ptr } from "bun:ffi";

// The memory a process holds, as the memory budget means it. On macOS
// that is the physical footprint, the number Activity Monitor shows. The
// resident size there also counts pages the allocator freed and the kernel
// has not taken back yet. Linux has no footprint, so there the resident size
// is the number.

const MB = 1024 * 1024;

// proc_pid_rusage fills a rusage_info_v2 struct: a 16-byte uuid, then 64-bit
// counters. ri_resident_size is counter 6 and ri_phys_footprint counter 7.
const RUSAGE_INFO_V2 = 2;
const UUID_WORDS = 2;
const RESIDENT_SIZE = UUID_WORDS + 6;
const PHYS_FOOTPRINT = UUID_WORDS + 7;
const STRUCT_WORDS = 32;

const libSystem = () =>
	dlopen("/usr/lib/libSystem.B.dylib", {
		proc_pid_rusage: { args: [FFIType.i32, FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
	});

let lib: ReturnType<typeof libSystem> | undefined;

// The resident size and the physical footprint of `pid`, in MB. On Linux
// both numbers are the resident size from /proc.
export const memoryOf = async (pid: number) => {
	if (process.platform !== "darwin") {
		const status = await Bun.file(`/proc/${pid}/status`).text();
		const rss = (Number(/VmRSS:\s+(\d+) kB/.exec(status)?.[1]) * 1024) / MB;
		return { rss, footprint: rss };
	}
	lib ??= libSystem();
	const info = new BigUint64Array(STRUCT_WORDS);
	const code = lib.symbols.proc_pid_rusage(pid, RUSAGE_INFO_V2, ptr(info));
	if (code !== 0) throw new Error(`proc_pid_rusage(${pid}) returned ${code}`);
	return { rss: Number(info[RESIDENT_SIZE]) / MB, footprint: Number(info[PHYS_FOOTPRINT]) / MB };
};
