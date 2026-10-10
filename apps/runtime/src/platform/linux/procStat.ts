export type LinuxProcessStat = {
	pid: number;
	state: string;
	parentPid: number;
	groupId: number;
	sessionId: number;
	startTicks: bigint;
};

// A boot ID changes at each boot. The start time counts clock ticks since
// boot, so the pair separates two processes that receive the same PID, also
// across a reboot. A clock tick is 10 ms on x86_64 and arm64. Two processes
// that receive the same PID within one tick on one boot have the same identity.
export const linuxProcessIdentity = (bootId: string, pid: number, startTicks: bigint): string =>
	`linux:${bootId}:${pid}:${startTicks}`;

// proc(5) puts the command name in parentheses as the second field. The name
// can contain spaces and parentheses, so the fields start after the last ")".
export function parseLinuxProcessStat(value: string): LinuxProcessStat {
	const nameStart = value.indexOf("(");
	const nameEnd = value.lastIndexOf(")");
	if (nameStart < 1 || nameEnd <= nameStart) throw new Error("The Linux process stat has no complete process name");
	const pid = Number(value.slice(0, nameStart).trim());
	const fields = value
		.slice(nameEnd + 1)
		.trim()
		.split(/\s+/);
	if (!Number.isSafeInteger(pid) || pid <= 0 || fields.length < 20)
		throw new Error("The Linux process stat has invalid fields");
	const parentPid = Number(fields[1]);
	const groupId = Number(fields[2]);
	const sessionId = Number(fields[3]);
	if (![parentPid, groupId, sessionId].every(Number.isSafeInteger) || !/^\d+$/.test(fields[19]!))
		throw new Error("The Linux process stat has invalid process identifiers");
	return { pid, state: fields[0]!, parentPid, groupId, sessionId, startTicks: BigInt(fields[19]!) };
}
