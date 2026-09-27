import { expect, test } from "bun:test";
import { errors } from "@trellis/api";
import { terminalStreamRuntime } from "./terminalRuntime.ts";

test("a stopped supervised runtime is unavailable to a terminal stream", async () => {
	const socketFailure = Object.assign(new Error("connect ENOENT"), { code: "ENOENT" });
	const records: Array<{ message: string; fields: Record<string, unknown> | undefined }> = [];
	await expect(
		terminalStreamRuntime({
			home: "/home/trellis",
			reqId: "request-1",
			log: { warn: (message, fields) => records.push({ message, fields }) },
			ensureRuntime: async () => {
				throw socketFailure;
			},
		}),
	).rejects.toMatchObject({
		code: "RUNNER_UNAVAILABLE",
		status: errors.RUNNER_UNAVAILABLE.status,
		data: { reason: "host" },
	});
	expect(records).toEqual([
		{
			message: "supervised runtime unavailable",
			fields: { reqId: "request-1", runtimeMode: "supervised", code: "ENOENT" },
		},
	]);
});
