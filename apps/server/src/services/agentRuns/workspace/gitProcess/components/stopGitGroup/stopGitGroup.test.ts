import { describe, expect, test } from "bun:test";
import { stopGitGroup } from "./stopGitGroup";

describe("Git process group cleanup", () => {
	test("kills the entire group", () => {
		const calls: [number, string][] = [];
		stopGitGroup(42, (pid, signal) => calls.push([pid, signal]));
		expect(calls).toEqual([[-42, "SIGKILL"]]);
	});

	for (const [name, snapshot] of [
		["an absent group", " 7 S\n"],
		["a group with only zombies", " 42 Z\n 42 Z+\n 7 S\n"],
	] as const) {
		test(`accepts EPERM for ${name}`, () => {
			stopGitGroup(
				42,
				() => {
					throw Object.assign(new Error("kill failed"), { code: "EPERM" });
				},
				() => snapshot,
			);
		});
	}

	test("preserves permission failures when a live descendant remains", () => {
		const error = Object.assign(new Error("kill failed"), { code: "EPERM" });
		expect(() =>
			stopGitGroup(
				42,
				() => {
					throw error;
				},
				() => " 42 Z\n 42 S\n",
			),
		).toThrow(error);
	});

	test("preserves a failed process inspection", () => {
		const error = new Error("ps failed");
		expect(() =>
			stopGitGroup(
				42,
				() => {
					throw Object.assign(new Error("kill failed"), { code: "EPERM" });
				},
				() => {
					throw error;
				},
			),
		).toThrow(error);
	});

	test("accepts a missing group without a process inspection", () => {
		stopGitGroup(
			42,
			() => {
				throw Object.assign(new Error("kill failed"), { code: "ESRCH" });
			},
			() => {
				throw new Error("Unexpected process inspection");
			},
		);
	});

	test("preserves other signal errors", () => {
		const error = Object.assign(new Error("invalid signal"), { code: "EINVAL" });
		expect(() =>
			stopGitGroup(42, () => {
				throw error;
			}),
		).toThrow(error);
	});
});
