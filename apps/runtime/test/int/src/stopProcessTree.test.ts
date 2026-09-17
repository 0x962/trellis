import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { originDir } from "../../../../../test/originDir.ts";

test("native inspection stops a leader and a descendant in a separate session without subprocesses", async () => {
	const child = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		[resolve(originDir(import.meta.dir), "../test/nativeStop.mjs")],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	let output = "";
	let error = "";
	child.stdout.on("data", (data) => {
		output += data;
	});
	child.stderr.on("data", (data) => {
		error += data;
	});
	const [code] = await once(child, "exit");
	expect({ code, error }).toEqual({ code: 0, error: "" });
	expect(output).toContain("The leader and its detached descendant exited without a subprocess for inspection.");
});
