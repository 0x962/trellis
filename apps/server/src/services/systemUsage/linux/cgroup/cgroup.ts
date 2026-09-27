import { dirname, join } from "node:path";

export type CgroupLimits = {
	cpuCores: number | null;
	cpuLimitKnown: boolean;
	cpuSetCount: number | null;
	cpuSetKnown: boolean;
	memoryBytes: number | null;
	memoryLimitKnown: boolean;
	memoryUsedBytes: number | null;
};

export type CgroupLimitReaderDeps = {
	readFile: (path: string) => Promise<string>;
	root: string;
	log: (message: string, fields?: Record<string, unknown>) => void;
};

const unavailableLimits = (): CgroupLimits => ({
	cpuCores: null,
	cpuLimitKnown: false,
	cpuSetCount: null,
	cpuSetKnown: false,
	memoryBytes: null,
	memoryLimitKnown: false,
	memoryUsedBytes: null,
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const readOptional = async (
	deps: CgroupLimitReaderDeps,
	failures: Map<string, string>,
	path: string,
): Promise<string | null> => {
	try {
		const value = await deps.readFile(path);
		failures.delete(path);
		return value;
	} catch (error) {
		const detail = errorText(error);
		if (failures.get(path) !== detail) deps.log("A cgroup file read failed.", { path, error: detail });
		failures.set(path, detail);
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

export const parseCpuLimit = (value: string): number | null | undefined => {
	const [quotaText, periodText] = value.trim().split(/\s+/);
	if (quotaText === "max" && periodText !== undefined) return null;
	const quota = Number(quotaText);
	const period = Number(periodText);
	if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(period) || period <= 0) return undefined;
	return quota / period;
};

export const parseByteLimit = (value: string): number | null | undefined => {
	const text = value.trim();
	if (text === "max") return null;
	const bytes = Number(text);
	return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : undefined;
};

const parseByteValue = (value: string): number | undefined => {
	const bytes = Number(value.trim());
	return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : undefined;
};

export const parseCpuSetCount = (value: string): number | undefined => {
	const text = value.trim();
	if (text === "") return undefined;
	let count = 0;
	for (const section of text.split(",")) {
		const range = /^(\d+)(?:-(\d+))?$/.exec(section);
		if (range === null) return undefined;
		const start = Number(range[1]);
		const end = Number(range[2] ?? range[1]);
		if (end < start) return undefined;
		count += end - start + 1;
	}
	return count;
};

const cgroupDirectories = (root: string, path: string) => {
	const leaf = path === "/" ? root : join(root, path);
	const directories = [leaf];
	while (directories[directories.length - 1] !== root) directories.push(dirname(directories[directories.length - 1]!));
	return directories;
};

const readLimits = async (deps: CgroupLimitReaderDeps, failures: Map<string, string>): Promise<CgroupLimits> => {
	const membership = await readOptional(deps, failures, "/proc/self/cgroup");
	const path = membership === null ? null : parseCgroupPath(membership);
	if (path === null) return unavailableLimits();

	const directories = cgroupDirectories(deps.root, path);
	const limitsByDirectory = await Promise.all(
		directories.map(async (directory) => {
			const [cpuText, cpuSetText, memoryText, memoryUsedText] = await Promise.all([
				readOptional(deps, failures, join(directory, "cpu.max")),
				readOptional(deps, failures, join(directory, "cpuset.cpus.effective")),
				readOptional(deps, failures, join(directory, "memory.max")),
				readOptional(deps, failures, join(directory, "memory.current")),
			]);
			const cpuCores = cpuText === null ? undefined : parseCpuLimit(cpuText);
			const cpuSetCount = cpuSetText === null ? undefined : parseCpuSetCount(cpuSetText);
			const memoryBytes = memoryText === null ? undefined : parseByteLimit(memoryText);
			return {
				cpuCores: cpuCores ?? null,
				cpuLimitKnown: cpuCores !== undefined,
				cpuSetCount: cpuSetCount ?? null,
				cpuSetKnown: cpuSetCount !== undefined,
				memoryBytes: memoryBytes ?? null,
				memoryLimitKnown: memoryBytes !== undefined,
				memoryUsedBytes: memoryUsedText === null ? null : (parseByteValue(memoryUsedText) ?? null),
			};
		}),
	);
	const cpuLimitKnown = limitsByDirectory.every((limit) => limit.cpuLimitKnown);
	const cpuSetKnown = limitsByDirectory.every((limit) => limit.cpuSetKnown);
	const memoryLimitKnown = limitsByDirectory.every((limit) => limit.memoryLimitKnown);
	const cpuCores = cpuLimitKnown
		? limitsByDirectory.reduce<number | null>(
				(value, limit) =>
					limit.cpuCores === null ? value : value === null ? limit.cpuCores : Math.min(value, limit.cpuCores),
				null,
			)
		: null;
	const cpuSetCount = cpuSetKnown
		? limitsByDirectory.reduce<number | null>(
				(value, limit) =>
					limit.cpuSetCount === null ? value : value === null ? limit.cpuSetCount : Math.min(value, limit.cpuSetCount),
				null,
			)
		: null;
	const strictestMemoryLimit = memoryLimitKnown
		? limitsByDirectory.reduce<(typeof limitsByDirectory)[number] | undefined>((strictest, limit) => {
				if (limit.memoryBytes === null) return strictest;
				if (strictest === undefined || strictest.memoryBytes === null) return limit;
				return limit.memoryBytes < strictest.memoryBytes ? limit : strictest;
			}, undefined)
		: undefined;
	return {
		cpuCores,
		cpuLimitKnown,
		cpuSetCount,
		cpuSetKnown,
		memoryBytes: strictestMemoryLimit?.memoryBytes ?? null,
		memoryLimitKnown,
		memoryUsedBytes:
			strictestMemoryLimit === undefined
				? (limitsByDirectory[0]?.memoryUsedBytes ?? null)
				: strictestMemoryLimit.memoryUsedBytes,
	};
};

export const readCgroupLimits = async (deps: CgroupLimitReaderDeps): Promise<CgroupLimits> =>
	readLimits(deps, new Map());

export const createCgroupLimitReader = (deps: CgroupLimitReaderDeps) => {
	const failures = new Map<string, string>();
	return () => readLimits(deps, failures);
};
