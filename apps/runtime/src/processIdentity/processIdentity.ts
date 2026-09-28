import { constants } from "node:os";
import type { RuntimeProcessMetadata } from "@trellis/runtime-protocol";
import { errno, load } from "koffi";

type Identity = Omit<RuntimeProcessMetadata, "executable">;
const pidInfo = load(null).func("int proc_pidinfo(int pid, int flavor, uint64_t arg, void *buffer, int buffersize)");

// The kernel start timestamp distinguishes processes that receive the same PID.
// This record remains readable after a release removes the executable file.
export function processIdentity(
	pid: number,
): { kind: "live"; process: Identity } | { kind: "missing" } | { kind: "unknown"; error: string } {
	const info = Buffer.alloc(136);
	const count = pidInfo(pid, 3, 0, info, info.length);
	if (count <= 0) {
		const failure = errno();
		return failure === constants.errno.ESRCH
			? { kind: "missing" }
			: { kind: "unknown", error: `proc_pidinfo(${pid}) failed with errno ${failure}` };
	}
	if (count !== info.length) return { kind: "unknown", error: `proc_pidinfo(${pid}) returned ${count} bytes` };
	if (info.readUInt32LE(4) === 5) return { kind: "missing" };
	return {
		kind: "live",
		process: {
			pid,
			parentPid: info.readUInt32LE(16),
			groupId: info.readUInt32LE(100),
			identity: `${pid}:${info.readBigUInt64LE(120)}:${info.readBigUInt64LE(128)}`,
			startedAt: new Date(
				Number(info.readBigUInt64LE(120)) * 1000 + Number(info.readBigUInt64LE(128)) / 1000,
			).toISOString(),
		},
	};
}
