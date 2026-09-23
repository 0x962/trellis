import type { MemoryPressureLevel } from "@trellis/api";

// `sysctl -n kern.memorystatus_vm_pressure_level` prints one number and a
// newline. The XNU kernel defines 1 as normal, 2 as warning, and 4 as
// critical, and it publishes no other value.
export const parseMemoryPressureLevel = (stdout: string): MemoryPressureLevel => {
	const level = Number(stdout.trim());
	if (level !== 1 && level !== 2 && level !== 4)
		throw new Error(`kern.memorystatus_vm_pressure_level reported ${stdout.trim()}`);
	return level;
};

// A computer that is not a Mac publishes no pressure level, and this answers
// null there. One read costs 10 to 30 milliseconds.
export const readMemoryPressureLevel = async (): Promise<MemoryPressureLevel | null> => {
	if (process.platform !== "darwin") return null;
	const proc = Bun.spawn(["/usr/sbin/sysctl", "-n", "kern.memorystatus_vm_pressure_level"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (code !== 0) throw new Error(`/usr/sbin/sysctl exited ${code}: ${stderr.trim()}`);
	return parseMemoryPressureLevel(stdout);
};
