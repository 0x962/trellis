import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

let directory: string;
let runner: string;
beforeAll(async () => {
	directory = await mkdtemp("/tmp/trl-startup-error-");
	runner = join(directory, "main.js");
	const build = await Bun.build({
		entrypoints: [resolve(originDir(import.meta.dir), "../main.ts")],
		target: "bun",
		format: "esm",
		plugins: [
			{
				name: "electron-startup-error",
				setup(builder) {
					builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "fixture" }));
					builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
						loader: "js",
						contents: `
const calls = [];
export const app = {
 isPackaged: process.argv[2] === "packaged",
 setName() {}, getPath() { return ${JSON.stringify(directory)}; }, setPath() {},
 requestSingleInstanceLock() { return true; }, setAsDefaultProtocolClient() {}, on() {},
 whenReady() { return Promise.reject(new Error("stdout maxBuffer length exceeded")); },
 quit() { calls.push({type: "quit"}); process.stdout.write(JSON.stringify(calls)); }
};
export const dialog = {
 async showMessageBox(options) { calls.push({type: "dialog", options}); return {response: 0}; },
 showOpenDialog() { throw new Error("A startup failure must not select a data directory"); },
 showErrorBox() { throw new Error("Unexpected secondary error"); }
};
export const BrowserWindow = class {};
export const ipcMain = {};
export const Menu = {};
export const session = {};
export const shell = {};
`,
					}));
				},
			},
		],
	});
	if (!build.success) throw new AggregateError(build.logs, "Desktop startup fixture build failed");
	await writeFile(runner, await build.outputs[0]!.text());
});
afterAll(() => rm(directory, { recursive: true, force: true }));

test.each(["packaged", "development"])("%s startup errors report the cause and offer only Quit", async (mode) => {
	const child = Bun.spawn([process.execPath, runner, mode], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(exitCode, stderr).toBe(0);
	expect(JSON.parse(stdout)).toEqual([
		{
			type: "dialog",
			options: {
				type: "error",
				message: "Trellis cannot start",
				detail: "stdout maxBuffer length exceeded",
				buttons: ["Quit"],
				defaultId: 0,
				cancelId: 0,
			},
		},
		{ type: "quit" },
	]);
});
