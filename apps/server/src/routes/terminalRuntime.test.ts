import { expect, test } from "bun:test";
import { errors } from "@trellis/api";
import { terminalStreamRuntime } from "./terminalRuntime.ts";

test("a stopped supervised runtime is unavailable to a terminal stream", async () => {
	const socketFailure = Object.assign(new Error("connect ENOENT"), { code: "ENOENT" });
	await expect(
		terminalStreamRuntime("/home/trellis", async () => {
			throw socketFailure;
		}),
	).rejects.toMatchObject({
		code: "RUNNER_UNAVAILABLE",
		status: errors.RUNNER_UNAVAILABLE.status,
		data: { reason: "host" },
	});
});
