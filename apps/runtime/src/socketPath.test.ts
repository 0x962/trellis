import { expect, test } from "bun:test";
import { validateSocketPath } from "./socketPath.ts";

test("rejects a socket path above the macOS byte limit", () => {
	expect(() => validateSocketPath(`/tmp/${"x".repeat(100)}`)).toThrow("shorter TRELLIS_HOME");
	expect(() => validateSocketPath(`/tmp/${"é".repeat(50)}`)).toThrow("shorter TRELLIS_HOME");
});
