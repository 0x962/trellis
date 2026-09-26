import { expect, test } from "bun:test";
import { mkdtemp, realpath, rm, stat, statfs, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDiskCapacity } from "./diskCapacity";

test("reads capacity on the volume of the resolved workspace root", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-disk-test-"));
	try {
		const link = join(root, "agents");
		await symlink(root, link);
		const result = await readDiskCapacity(link);
		expect(result.state).toBe("available");
		if (result.state !== "available") throw new Error("No capacity result");
		const capacity = await statfs(root);
		expect(result.path).toBe(await realpath(root));
		expect(result.volumeId).toBe(String((await stat(root)).dev));
		expect(result.totalBytes).toBe(capacity.bsize * capacity.blocks);
		expect(result.availableBytes).toBeGreaterThan(0);
		expect(result.usedPercent).toBeGreaterThanOrEqual(0);
		expect(result.usedPercent).toBeLessThanOrEqual(100);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("returns no invented capacity when the workspace root is absent", async () => {
	expect(await readDiskCapacity("/trellis-absent-disk-test/agents")).toEqual({
		state: "failed",
		path: "/trellis-absent-disk-test/agents",
	});
});
