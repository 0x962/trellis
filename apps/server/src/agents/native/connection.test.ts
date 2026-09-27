import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureNativeRuntime } from "./connection.ts";

test("a supervised host returns the socket failure without a detached launch", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-supervised-runtime-"));
	try {
		await expect(ensureNativeRuntime(home, "supervised")).rejects.toMatchObject({ code: "ENOENT" });
		expect(await readdir(home)).toEqual([]);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
