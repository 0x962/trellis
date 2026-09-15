import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { hashBundle } from "../resourceBundle/resourceBundle.ts";
import { writeDesktopBuild } from "./desktopBuild.ts";

const files = [
	"dist/main.cjs",
	"dist/startup.html",
	"dist/preload.cjs",
	"dist/host-service.cjs",
	"dist/TrellisHost",
	"native/com.trellis.desktop.host.plist",
];

test("each desktop launcher and service file contributes to the host release identity", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-desktop-build-"));
	const host = join(root, "dist/host");
	try {
		await mkdir(host, { recursive: true });
		for (const file of files) {
			await mkdir(dirname(join(root, file)), { recursive: true });
			await writeFile(join(root, file), "original");
		}
		await writeDesktopBuild(root, host);
		const original = await hashBundle(host, "1", 1);
		await writeDesktopBuild(root, host);
		expect(await hashBundle(host, "1", 1)).toBe(original);
		for (const file of files) {
			await writeFile(join(root, file), "changed");
			await writeDesktopBuild(root, host);
			expect(await hashBundle(host, "1", 1)).not.toBe(original);
			await writeFile(join(root, file), "original");
		}
	} finally {
		await rm(root, { recursive: true });
	}
});
