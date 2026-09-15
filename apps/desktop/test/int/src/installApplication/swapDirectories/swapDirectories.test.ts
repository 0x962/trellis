import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { swapDirectories } from "../../../../../src/installApplication/swapDirectories/swapDirectories.ts";

test("macOS exchanges two nonempty app directories and preserves both bundles", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-swap-apps-"));
	try {
		const staged = join(root, "staged.app");
		const installed = join(root, "installed.app");
		await mkdir(staged);
		await mkdir(installed);
		await writeFile(join(staged, "release"), "new");
		await writeFile(join(installed, "release"), "old");
		await swapDirectories(staged, installed);
		expect(await readFile(join(installed, "release"), "utf8")).toBe("new");
		expect(await readFile(join(staged, "release"), "utf8")).toBe("old");
		await expect(swapDirectories(join(root, "missing.app"), installed)).rejects.toThrow();
		expect(await readFile(join(installed, "release"), "utf8")).toBe("new");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
