import { expect, test } from "bun:test";
import { RUNTIME_PROTOCOL_VERSION, type RuntimeRequest } from "@trellis/runtime-protocol";
import { validateRequest } from "./validateRequest.ts";

const launch: RuntimeRequest = {
	id: "request",
	version: RUNTIME_PROTOCOL_VERSION,
	method: "start",
	params: { id: "attempt", command: "/bin/cat", args: [], cwd: "/tmp", mode: "stdio" },
};
test("requires a compatible protocol before launch", () => {
	expect(() => validateRequest({ ...launch, version: RUNTIME_PROTOCOL_VERSION + 1 })).toThrow("incompatible");
});
test("rejects paths in session identifiers", () => {
	expect(() => validateRequest({ ...launch, params: { ...launch.params, id: "../../other" } })).toThrow(
		"Session identifier",
	);
});
test("requires byte-safe input and bounded terminal dimensions", () => {
	expect(() => validateRequest({ ...launch, method: "input", params: { id: "attempt", data: "%%%" } })).toThrow(
		"base64",
	);
	expect(() => validateRequest({ ...launch, method: "resize", params: { id: "attempt", cols: 0, rows: 24 } })).toThrow(
		"dimensions",
	);
});
test("accepts a structured launch and absolute working directory", () => {
	expect(validateRequest(launch)).toEqual(launch);
});
