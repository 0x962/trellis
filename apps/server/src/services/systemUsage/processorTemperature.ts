import { existsSync } from "node:fs";
import type { ProcessorTemperature } from "@trellis/api";

const READER_TIMEOUT_MS = 2_000;

type NativeResult =
	| {
			state: "available";
			celsius: number;
			sensor: string;
			source: "IOHIDEventSystemClient";
			units: "degrees Celsius";
	  }
	| { state: "unavailable"; reason: string };

type ReaderProcess = {
	exited: Promise<number>;
	stdout: ReadableStream<Uint8Array>;
	stderr: ReadableStream<Uint8Array>;
	kill: () => void;
};

type Deadline = { wait: Promise<"timeout">; cancel: () => void };

export type ProcessorTemperatureReaderDeps = {
	platform: string;
	path: string | undefined;
	exists: (path: string) => boolean;
	spawn: (path: string) => ReaderProcess;
	now: () => number;
	deadline: () => Deadline;
};

const elapsed = (startedAt: number, now: () => number) => Math.round((now() - startedAt) * 1_000) / 1_000;

export const parseProcessorTemperatureOutput = (stdout: string): NativeResult | null => {
	let value: unknown;
	try {
		value = JSON.parse(stdout);
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null) return null;
	const result = value as Record<string, unknown>;
	if (result.state === "unavailable" && typeof result.reason === "string")
		return { state: "unavailable", reason: result.reason };
	if (
		result.state !== "available" ||
		result.source !== "IOHIDEventSystemClient" ||
		result.units !== "degrees Celsius" ||
		typeof result.celsius !== "number" ||
		!Number.isFinite(result.celsius) ||
		typeof result.sensor !== "string" ||
		!/^PMU tdie\d+$/.test(result.sensor)
	)
		return null;
	return {
		state: "available",
		celsius: result.celsius,
		sensor: result.sensor,
		source: result.source,
		units: result.units,
	};
};

export const runProcessorTemperatureReader = async (
	deps: ProcessorTemperatureReaderDeps,
): Promise<ProcessorTemperature> => {
	if (deps.platform !== "darwin") return { state: "unavailable", reason: "unsupported-platform", readDurationMs: 0 };
	if (deps.path === undefined || !deps.exists(deps.path))
		return { state: "unavailable", reason: "reader-not-installed", readDurationMs: 0 };
	const startedAt = deps.now();
	let process: ReaderProcess;
	try {
		process = deps.spawn(deps.path);
	} catch {
		return { state: "failed", reason: "reader-start", readDurationMs: elapsed(startedAt, deps.now) };
	}
	const completed = Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]).then(([code, stdout, stderr]) => ({ kind: "completed" as const, code, stdout, stderr }));
	const deadline = deps.deadline();
	const outcome = await Promise.race([completed, deadline.wait.then(() => ({ kind: "timeout" as const }))]);
	deadline.cancel();
	if (outcome.kind === "timeout") {
		process.kill();
		await completed;
		return { state: "failed", reason: "reader-timeout", readDurationMs: elapsed(startedAt, deps.now) };
	}
	const readDurationMs = elapsed(startedAt, deps.now);
	if (outcome.code !== 0) return { state: "failed", reason: "reader-exit", readDurationMs };
	const result = parseProcessorTemperatureOutput(outcome.stdout);
	if (result === null) return { state: "failed", reason: "reader-output", readDurationMs };
	if (result.state === "unavailable") return { state: "unavailable", reason: "sensor-unavailable", readDurationMs };
	return {
		state: "available",
		celsius: result.celsius,
		sensor: result.sensor,
		source: result.source,
		readDurationMs,
	};
};

const nativeSpawn = (path: string): ReaderProcess => {
	const process = Bun.spawn([path], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	return {
		exited: process.exited,
		stdout: process.stdout,
		stderr: process.stderr,
		kill: () => process.kill("SIGKILL"),
	};
};

const nativeDeadline = (): Deadline => {
	let timer: ReturnType<typeof setTimeout>;
	const wait = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), READER_TIMEOUT_MS);
	});
	return { wait, cancel: () => clearTimeout(timer) };
};

export const createProcessorTemperatureReader = (deps: ProcessorTemperatureReaderDeps) => {
	let active: Promise<ProcessorTemperature> | null = null;
	return () => {
		if (active !== null) return active;
		active = runProcessorTemperatureReader(deps).finally(() => {
			active = null;
		});
		return active;
	};
};

export const readProcessorTemperature = createProcessorTemperatureReader({
	platform: process.platform,
	path: process.env.TRELLIS_PROCESSOR_TEMPERATURE_READER,
	exists: existsSync,
	spawn: nativeSpawn,
	now: () => performance.now(),
	deadline: nativeDeadline,
});
