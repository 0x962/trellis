import { expect, test } from "bun:test";
import { workerError } from "./workerError.ts";

test("a worker module failure retains its message when the event has no error object", () => {
	const error = workerError({ error: null, message: "Cannot find package zod/v4/core" });
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe("Cannot find package zod/v4/core");
});

test("a worker exception retains its original error and stack", () => {
	const cause = new Error("Worker failed");
	expect(workerError({ error: cause, message: cause.message })).toBe(cause);
});
