import { describe, expect, test } from "bun:test";
import {
	createProcessorTemperatureReader,
	type ProcessorTemperatureReaderDeps,
	parseProcessorTemperatureOutput,
	runProcessorTemperatureReader,
} from "./processorTemperature.ts";

const stream = (value: string) => new Blob([value]).stream();

const deps = (result: {
	code?: number;
	stdout?: string;
	timeout?: boolean;
}): ProcessorTemperatureReaderDeps & { killed: () => boolean } => {
	let killed = false;
	let resolveExit: (code: number) => void = () => {};
	const exited = result.timeout
		? new Promise<number>((resolve) => {
				resolveExit = resolve;
			})
		: Promise.resolve(result.code ?? 0);
	const times = [10, 12.5];
	return {
		platform: "darwin",
		path: "/release/bin/processor-temperature",
		exists: () => true,
		spawn: () => ({
			exited,
			stdout: stream(result.stdout ?? ""),
			stderr: stream(""),
			kill: () => {
				killed = true;
				resolveExit(9);
			},
		}),
		now: () => times.shift()!,
		deadline: () => ({
			wait: result.timeout ? Promise.resolve("timeout") : new Promise(() => {}),
			cancel: () => {},
		}),
		killed: () => killed,
	};
};

describe("parseProcessorTemperatureOutput", () => {
	test("accepts the measured IOKit processor sensor", () => {
		expect(
			parseProcessorTemperatureOutput(
				'{"state":"available","source":"IOHIDEventSystemClient","sensor":"PMU tdie6","units":"degrees Celsius","celsius":73.018}',
			),
		).toEqual({
			state: "available",
			celsius: 73.018,
			sensor: "PMU tdie6",
			source: "IOHIDEventSystemClient",
			units: "degrees Celsius",
		});
	});

	test("rejects a battery reading as processor temperature", () => {
		expect(
			parseProcessorTemperatureOutput(
				'{"state":"available","source":"IOHIDEventSystemClient","sensor":"gas gauge battery","units":"degrees Celsius","celsius":32.6}',
			),
		).toBeNull();
	});
});

describe("runProcessorTemperatureReader", () => {
	test("reports the sensor and the full helper process cost", async () => {
		const input = deps({
			stdout:
				'{"state":"available","source":"IOHIDEventSystemClient","sensor":"PMU tdie6","units":"degrees Celsius","celsius":73.018}',
		});
		await expect(runProcessorTemperatureReader(input)).resolves.toEqual({
			state: "available",
			celsius: 73.018,
			sensor: "PMU tdie6",
			source: "IOHIDEventSystemClient",
			readDurationMs: 2.5,
		});
		expect(input.killed()).toBe(false);
	});

	test("kills the helper at its time bound and reports a failed read", async () => {
		const input = deps({ timeout: true });
		await expect(runProcessorTemperatureReader(input)).resolves.toEqual({
			state: "failed",
			reason: "reader-timeout",
			readDurationMs: 2.5,
		});
		expect(input.killed()).toBe(true);
	});

	test("reports a crashed helper without a temperature value", async () => {
		const input = deps({ code: 11 });
		await expect(runProcessorTemperatureReader(input)).resolves.toEqual({
			state: "failed",
			reason: "reader-exit",
			readDurationMs: 2.5,
		});
		expect(input.killed()).toBe(false);
	});

	test("reports an unavailable sensor without a guessed value", async () => {
		const input = deps({ stdout: '{"state":"unavailable","reason":"no-processor-temperature-sensor"}' });
		await expect(runProcessorTemperatureReader(input)).resolves.toEqual({
			state: "unavailable",
			reason: "sensor-unavailable",
			readDurationMs: 2.5,
		});
	});

	test("does not start a helper when the release has none", async () => {
		let started = false;
		const input = deps({});
		input.exists = () => false;
		input.spawn = () => {
			started = true;
			throw new Error("unexpected helper");
		};
		await expect(runProcessorTemperatureReader(input)).resolves.toEqual({
			state: "unavailable",
			reason: "reader-not-installed",
			readDurationMs: 0,
		});
		expect(started).toBe(false);
	});

	test("shares one helper process between concurrent reads", async () => {
		const input = deps({
			stdout:
				'{"state":"available","source":"IOHIDEventSystemClient","sensor":"PMU tdie6","units":"degrees Celsius","celsius":73.018}',
		});
		const spawn = input.spawn;
		let starts = 0;
		input.spawn = (path) => {
			starts += 1;
			return spawn(path);
		};
		const read = createProcessorTemperatureReader(input);
		const first = read();
		const second = read();
		expect(second).toBe(first);
		await first;
		expect(starts).toBe(1);
	});
});
