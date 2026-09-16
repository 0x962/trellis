import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

const root = resolve(originDir(import.meta.dir), "../..");

test("the compiled preload exposes its narrow bridge inside a sandboxed Electron renderer", async () => {
	const electron = resolve(root, "../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
	const child = Bun.spawn(
		[electron, resolve(root, "test/fixtures/preloadProbe.cjs"), resolve(root, "dist/preload.cjs")],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
	expect(code).toBe(0);
	const result = JSON.parse(stdout.trim());
	expect(result).toEqual({
		bridge: [
			"platform",
			"chooseDirectory",
			"status",
			"serviceStatus",
			"updateStatus",
			"setOpenAtLogin",
			"run",
			"onNavigate",
		],
		platform: "darwin",
		require: "undefined",
		process: "undefined",
	});
}, 15000);
