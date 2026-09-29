import { expect, test } from "bun:test";
import { observerLaunchFailureCode } from "./observerLaunchFailure.ts";

test.each(["HARNESS_NOT_INSTALLED", "ENOENT", "EACCES", "NOT_FOUND", "INVALID_INPUT", "RUNNER_UNAVAILABLE"])(
	"retains the allowed launch cause %s without private details",
	(code) => {
		expect(observerLaunchFailureCode(Object.assign(new Error("private prompt and /private/profile"), { code }))).toBe(
			code,
		);
	},
);
test("discards unknown codes and private error text", () => {
	expect(observerLaunchFailureCode(Object.assign(new Error("secret"), { code: "private token" }))).toBe(
		"OBSERVER_LAUNCH_FAILED",
	);
	expect(observerLaunchFailureCode("private prompt")).toBe("OBSERVER_LAUNCH_FAILED");
	expect(observerLaunchFailureCode(new DOMException("private prompt", "AbortError"))).toBe("REQUEST_CANCELED");
});
