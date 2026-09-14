import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";
import { adoptHost, waitForHostExit } from "../../../../src/host/host.ts";
import { serviceCommand } from "../../../../src/service/service.ts";

const root = resolve(originDir(import.meta.dir), "../..");
const preview = process.env.TRELLIS_DESKTOP_PREVIEW_APP;
const run = async (...args: string[]) => {
	const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const stderr = new Response(process.stderr).text();
	expect(await process.exited, await stderr).toBe(0);
};

test.skipIf(!preview)(
	"the signed Electron app starts its isolated service and loads its renderer",
	async () => {
		const directory = await mkdtemp("/tmp/trl-preview-");
		const application = join(directory, "Trellis Preview.app");
		const contents = join(application, "Contents");
		const home = join(directory, "data/host");
		const userData = join(directory, "data");
		const resultPath = join(directory, "result.json");
		const errorPath = join(directory, "error.json");
		const label = `com.trellis.test.preview.${process.pid}.${Date.now()}`;
		const helper = join(contents, "MacOS/TrellisHost");
		let desktop: ReturnType<typeof Bun.spawn> | undefined;
		let helperReady = false;
		try {
			await mkdir(userData, { recursive: true });
			await cp(resolve(preview!), application, { recursive: true, verbatimSymlinks: true });
			const appRoot = join(contents, "Resources/app");
			await run(join(root, "../../node_modules/.bin/asar"), "extract", join(contents, "Resources/app.asar"), appRoot);
			await rm(join(contents, "Resources/app.asar"));
			let main = await readFile(join(appRoot, "dist/main.cjs"), "utf8");
			expect(main).toContain('app.setAsDefaultProtocolClient("trellis")');
			expect(main).toContain('app.setName("Trellis");');
			main = main.replace(/\w+\.app\.setAsDefaultProtocolClient\("trellis"\);/, "void 0;");
			expect(main).not.toContain('setAsDefaultProtocolClient("trellis")');
			const prefix = `
const previewElectron = require("electron");
const previewFs = require("node:fs");
const previewResult = {appData: previewElectron.app.getPath("appData"), beforeName: previewElectron.app.getPath("userData"), order: []};
const previewMkdir = previewFs.mkdirSync;
previewFs.mkdirSync = (path, options) => previewMkdir(path === require("node:path").join(previewResult.appData, "Trellis") ? ${JSON.stringify(userData)} : path, options);
const previewSetPath = previewElectron.app.setPath.bind(previewElectron.app);
previewElectron.app.setPath = (name, path) => {
 if (name === "userData") { previewResult.defaultUserData = path; previewResult.order.push("data"); return previewSetPath(name, ${JSON.stringify(userData)}); }
 return previewSetPath(name, path);
};
previewElectron.app.requestSingleInstanceLock = () => { previewResult.order.push("lock"); previewResult.lockSawUserData = previewElectron.app.getPath("userData"); return true; };
previewElectron.dialog.showMessageBox = async (options) => {
 if (options.message === "Choose Trellis data") return {response: 0};
 if (options.message === "Enable Trellis background work?") return {response: 1};
 throw new Error("Unexpected preview prompt: " + options.message);
};
previewElectron.dialog.showErrorBox = (title, message) => {
 previewFs.writeFileSync(${JSON.stringify(errorPath)}, JSON.stringify({title, message, ...previewResult}));
 previewElectron.app.exit(1);
};
previewElectron.app.on("browser-window-created", (_event, window) => {
 window.webContents.once("did-finish-load", () => {
  previewResult.url = window.webContents.getURL();
  previewFs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(previewResult));
  previewElectron.app.quit();
 });
});
`;
			await writeFile(join(appRoot, "dist/main.cjs"), prefix + main);
			await run("/usr/libexec/PlistBuddy", "-c", `Set :CFBundleIdentifier ${label}`, join(contents, "Info.plist"));
			await run("/usr/libexec/PlistBuddy", "-c", "Delete :CFBundleURLTypes", join(contents, "Info.plist"));
			const source = (await readFile(join(root, "native/TrellisHost.swift"), "utf8")).replace(
				"com.trellis.desktop.host.plist",
				`${label}.plist`,
			);
			await writeFile(join(directory, "helper.swift"), source);
			await run("xcrun", "swiftc", join(directory, "helper.swift"), "-o", helper);
			await rm(join(contents, "Library/LaunchAgents/com.trellis.desktop.host.plist"));
			await writeFile(
				join(contents, `Library/LaunchAgents/${label}.plist`),
				`<?xml version="1.0"?><plist version="1.0"><dict>
<key>Label</key><string>${label}</string><key>BundleProgram</key><string>Contents/MacOS/TrellisHost</string>
<key>ProgramArguments</key><array><string>TrellisHost</string><string>serve</string></array>
<key>EnvironmentVariables</key><dict><key>TRELLIS_DESKTOP_HOME</key><string>${home}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>1</integer>
</dict></plist>`,
			);
			await run(
				"/usr/bin/codesign",
				"--force",
				"--sign",
				"-",
				"--options",
				"0",
				"--entitlements",
				join(root, "entitlements.mac.plist"),
				application,
			);
			await run("/usr/bin/codesign", "--verify", "--deep", "--strict", application);
			helperReady = true;
			desktop = Bun.spawn([join(contents, "MacOS/Trellis")], {
				env: { ...process.env, TRELLIS_DESKTOP_HOME: undefined },
				stdout: "pipe",
				stderr: "pipe",
			});
			const deadline = Date.now() + 30000;
			while (!existsSync(resultPath) && !existsSync(errorPath) && desktop.exitCode === null && Date.now() < deadline)
				await Bun.sleep(100);
			expect(existsSync(errorPath) ? await readFile(errorPath, "utf8") : "").toBe("");
			if (!existsSync(resultPath) && desktop.exitCode === null) {
				desktop.kill("SIGTERM");
				await desktop.exited;
			}
			expect(existsSync(resultPath), await new Response(desktop.stderr as ReadableStream).text()).toBe(true);
			const result = JSON.parse(await readFile(resultPath, "utf8"));
			console.log(JSON.stringify(result));
			expect(result.defaultUserData).toBe(join(result.appData, "Trellis"));
			expect(result.order).toEqual(["data", "lock"]);
			expect(result.lockSawUserData).toBe(userData);
			const host = await adoptHost(home);
			expect(result.url).toBe(`${host.origin}/`);
			expect((await serviceCommand(helper, "status")).status).toBe("enabled");
			expect(await desktop.exited).toBe(0);
		} finally {
			if (desktop && desktop.exitCode === null) {
				desktop.kill("SIGTERM");
				await desktop.exited;
			}
			if (helperReady) {
				await serviceCommand(helper, "unregister");
				await waitForHostExit(home);
			}
			await rm(directory, { recursive: true, force: true });
		}
	},
	120000,
);
