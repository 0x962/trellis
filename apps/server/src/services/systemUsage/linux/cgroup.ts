import { dirname, join } from "node:path";

export type CgroupLimits = {
	cpuCores: number | null;
	cpuSetCount: number | null;
	memoryBytes: number | null;
	memoryUsedBytes: number | null;
};

export type CgroupDeps = {
	readFile: (path: string) => Promise<string>;
	root: string;
};

const readOptional = async (deps: CgroupDeps, path: string) => {
	try {
		return await deps.readFile(path);
	} catch {
		return null;
	}
};

export const parseCgroupPath = (value: string): string | null => {
	const entry = value
		.trim()
		.split("\n")
		.find((line) => line.startsWith("0::"));
	if (entry === undefined) return null;
	const path = entry.slice(3);
	if (!path.startsWith("/")) return null;
	const segments = path.split("/").filter(Boolean);
	if (segments.some((segment) => segment === "." || segment === "..")) return null;
	return `/${segments.join("/")}`;
};

export const parseCpuLimit = (value: string): number | null => {
	const [quotaText, periodText] = value.trim().split(/\s+/);
	if (quotaText === "max") return null;
	const quota = Number(quotaText);
	const period = Number(periodText);
	if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(period) || period <= 0) return null;
	return quota / period;
};

export const parseByteLimit = (value: string): number | null => {
	const text = value.trim();
	if (text === "max") return null;
	const bytes = Number(text);
	return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
};

export const parseCpuSetCount = (value: string): number | null => {
	const text = value.trim();
	if (text === "") return null;
	let count = 0;
	for (const section of text.split(",")) {
		const range = /^(\d+)(?:-(\d+))?$/.exec(section);
		if (range === null) return null;
		const start = Number(range[1]);
		const end = Number(range[2] ?? range[1]);
		if (end < start) return null;
		count += end - start + 1;
	}
	return count;
};

const cgroupDirectories = (root: string, path: string) => {
	const leaf = join(root, path);
	const directories = [leaf];
	while (directories[directories.length - 1] !== root) directories.push(dirname(directories[directories.length - 1]!));
	return directories;
};

export const readCgroupLimits = async (deps: CgroupDeps): Promise<CgroupLimits> => {
	const membership = await readOptional(deps, "/proc/self/cgroup");
	const path = membership === null ? null : parseCgroupPath(membership);
	if (path === null) return { cpuCores: null, cpuSetCount: null, memoryBytes: null, memoryUsedBytes: null };

	const directories = cgroupDirectories(deps.root, path);
	const rows = await Promise.all(
		directories.map(async (directory) => {
			const [cpu, cpuSet, memory, used] = await Promise.all([
				readOptional(deps, join(directory, "cpu.max")),
				readOptional(deps, join(directory, "cpuset.cpus.effective")),
				readOptional(deps, join(directory, "memory.max")),
				readOptional(deps, join(directory, "memory.current")),
			]);
			return {
				cpuCores: cpu === null ? null : parseCpuLimit(cpu),
				cpuSetCount: cpuSet === null ? null : parseCpuSetCount(cpuSet),
				memoryBytes: memory === null ? null : parseByteLimit(memory),
				memoryUsedBytes: used === null ? null : parseByteLimit(used),
			};
		}),
	);
	const cpuCores = rows.reduce<number | null>(
		(limit, row) =>
			row.cpuCores === null ? limit : limit === null ? row.cpuCores : Math.min(limit, row.cpuCores),
		null,
	);
	const cpuSetCount = rows.reduce<number | null>(
		(limit, row) =>
			row.cpuSetCount === null ? limit : limit === null ? row.cpuSetCount : Math.min(limit, row.cpuSetCount),
		null,
	);
	const memory = rows
		.filter(
			(row): row is {
				cpuCores: number | null;
				cpuSetCount: number | null;
				memoryBytes: number;
				memoryUsedBytes: number;
			} =>
				row.memoryBytes !== null && row.memoryUsedBytes !== null,
		)
		.sort((left, right) => left.memoryBytes - right.memoryBytes)[0];
	return {
		cpuCores,
		cpuSetCount,
		memoryBytes: memory?.memoryBytes ?? null,
		memoryUsedBytes: memory?.memoryUsedBytes ?? null,
	};
};
