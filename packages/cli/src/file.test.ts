import { expect, test } from "bun:test";
import { fileAt } from "./file.ts";

test("a missing file is one NOT_FOUND failure", () => {
	expect(() => fileAt("/tmp/trellis-trl-194-no-such-file")).toThrow("No file at /tmp/trellis-trl-194-no-such-file.");
});
