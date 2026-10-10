import { expect, test } from "bun:test";
import { environmentFromArgs } from "./environmentFromArgs.ts";

test("attempt markers in command arguments do not identify an agent", () => {
	const argc = Buffer.alloc(4);
	argc.writeInt32LE(3);
	const data = Buffer.concat([
		argc,
		Buffer.from(
			"/bin/node\0\0node\0TRELLIS_ATTEMPT_ID=other\0\0TRELLIS_ATTEMPT_ID=actual\0TRELLIS_RUNTIME_HOME=/runtime\0",
		),
	]);
	expect(environmentFromArgs(data)).toEqual(["TRELLIS_ATTEMPT_ID=actual", "TRELLIS_RUNTIME_HOME=/runtime"]);
});
