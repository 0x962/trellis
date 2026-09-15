import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

let directory: string;
let runner: string;
beforeAll(async () => {
	directory = await mkdtemp("/tmp/trl-startup-ready-");
	runner = join(directory, "main.js");
	const fixtures: Record<string, string> = {
		electron: `
globalThis.calls = [];
globalThis.handlers = {};
process.on("beforeExit", () => process.stdout.write(JSON.stringify(globalThis.calls)));
process.resourcesPath = ${JSON.stringify(directory)};
export const app = {
 isPackaged: true, getAppPath() { return ${JSON.stringify(directory)}; },
 getPath() { return ${JSON.stringify(directory)}; }, setName() {}, setPath() {},
 requestSingleInstanceLock() { return true; }, setAsDefaultProtocolClient() {},
 on(name, handler) { globalThis.handlers[name] = handler; }, whenReady() { return Promise.resolve(); },
 getLoginItemSettings() { return {openAtLogin: false}; }, quit() { globalThis.calls.push("quit"); }
};
export class BrowserWindow {
 constructor() { globalThis.calls.push("create main window"); this.events = {}; this.webContents = { on() {}, setWindowOpenHandler() {} }; }
 once(name, callback) { this.events[name] = callback; }
 on() {} isMinimized() { return false; } isFullScreen() { return false; }
 maximize() {} show() {} focus() {}
 async loadURL(url) {
  globalThis.calls.push("load " + url);
  this.events["ready-to-show"]();
 }
}
export const session = { fromPartition() { return {setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, webRequest: {onBeforeSendHeaders() {}}}; }};
export const ipcMain = {handle() {}};
export const Menu = {buildFromTemplate(value) {return value;}, setApplicationMenu() {}};
export const shell = {};
export const dialog = {async showMessageBox(options) {globalThis.calls.push("error " + options.detail); return {response: 0};}};
`,
		"./prepareHome/prepareHome.ts": "export const prepareHome = async () => true;",
		"./pinnedResources/pinnedResources.ts":
			"export const pinResources = async () => ({root: 'fixture', manifest: {id: 'fixture'}});",
		"./activateHostRelease/activateHostRelease.ts": `export const activateHostRelease = async () => {
 globalThis.calls.push("host ready"); return {origin: "http://fixture", token: "token", pid: 1};
};`,
		"./updateStatus/updateStatus.ts":
			"export const readUpdateStatus = async () => ({state: 'current', active: {root: 'fixture'}});",
		"./startupProgress/index.ts": `export const startupProgress = () => ({
 show: async (stage) => globalThis.calls.push("progress " + stage),
 close: () => globalThis.calls.push("close progress")
});`,
		"./installCli/installCli.ts": `export const installCli = async () => {
 globalThis.calls.push("install tools");
 const event = process.argv[2];
 if (event === "open-url") globalThis.handlers[event]({preventDefault() {}}, "trellis://open/p/READY");
 else if (event === "second-instance") globalThis.handlers[event]({}, []);
 else globalThis.handlers[event]();
 await Bun.sleep(1);
 if (process.argv[3] === "fail") throw new Error("CLI installation failed");
 globalThis.calls.push("tools ready"); globalThis.toolsReady = true;
};`,
	};
	const build = await Bun.build({
		entrypoints: [resolve(originDir(import.meta.dir), "../main.ts")],
		target: "bun",
		format: "esm",
		plugins: [
			{
				name: "startup-readiness",
				setup(builder) {
					builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
						if (fixtures[path] && (path === "electron" || importer.endsWith("/src/main.ts")))
							return { path, namespace: "fixture" };
					});
					builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
						loader: "js",
						contents: fixtures[path]!,
					}));
				},
			},
		],
	});
	if (!build.success) throw new AggregateError(build.logs, "Desktop readiness fixture build failed");
	await writeFile(runner, await build.outputs[0]!.text());
});
afterAll(() => rm(directory, { recursive: true, force: true }));

test.each(["activate", "second-instance", "open-url"])(
	"%s waits for tools before it opens the main window",
	async (event) => {
		const child = Bun.spawn([process.execPath, runner, event], { stdout: "pipe", stderr: "pipe" });
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect(code, stderr).toBe(0);
		const calls = JSON.parse(stdout) as string[];
		expect(calls.indexOf("create main window")).toBeGreaterThan(calls.indexOf("tools ready"));
		expect(calls.indexOf("close progress")).toBeGreaterThan(calls.indexOf("tools ready"));
		expect(calls.filter((call) => call === "create main window")).toHaveLength(1);
		expect(calls).toContain(event === "open-url" ? "load http://fixture/p/READY" : "load http://fixture/");
	},
);

test("a failed tool setup closes progress and reports the error without opening the main window", async () => {
	const child = Bun.spawn([process.execPath, runner, "activate", "fail"], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(code, stderr).toBe(0);
	const calls = JSON.parse(stdout) as string[];
	expect(calls).not.toContain("create main window");
	expect(calls.slice(-3)).toEqual(["close progress", "error CLI installation failed", "quit"]);
});
