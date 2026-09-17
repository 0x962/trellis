import { expect, test } from "bun:test";
import { terminalUnavailable } from "./terminalUnavailable";

test("an uncontrollable process exposes its runtime failure", () => {
	expect(terminalUnavailable({ status: "unknown", controllable: false, error: "Process inspection timed out." })).toBe(
		"Terminal input is unavailable. Process inspection timed out.",
	);
	expect(terminalUnavailable({ status: "running", controllable: false, error: null })).toBe(
		"Terminal input is unavailable. The runtime cannot control this process.",
	);
});

test("connected and exited processes have no control failure", () => {
	expect(terminalUnavailable(null)).toBeNull();
	expect(terminalUnavailable({ status: "running", controllable: true, error: null })).toBeNull();
	expect(terminalUnavailable({ status: "exited", controllable: false, error: null })).toBeNull();
});
