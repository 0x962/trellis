import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";
import { adoptHost, connectHost, waitForHostExit } from "../../../../src/host/host.ts";
import { serviceCommand } from "../../../../src/service/service.ts";

const root = resolve(originDir(import.meta.dir), "../..");
const preview = process.env.TRELLIS_DESKTOP_PREVIEW_APP;
const run = async (...args: string[]) => {
	const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const stderr = new Response(process.stderr).text();
	expect(await process.exited, await stderr).toBe(0);
};

for (const useExisting of [false, true])
	test.skipIf(!preview)(
		useExisting
			? "the signed Electron app selects an existing database in place"
			: "the signed Electron app starts its isolated service and loads its renderer",
		async () => {
			const directory = await mkdtemp("/tmp/trl-preview-");
			const application = join(directory, "Trellis Preview.app");
			const contents = join(application, "Contents");
			const userData = join(directory, "data");
			const originalHome = join(userData, "host");
			const home = useExisting ? join(directory, "existing-data") : originalHome;
			const resultPath = join(directory, "result.json");
			const errorPath = join(directory, "error.json");
			const relaunchPath = join(directory, "relaunch.json");
			const label = `com.trellis.test.preview.${process.pid}.${Date.now()}`;
			const helper = join(contents, "MacOS/TrellisHost");
			let desktop: ReturnType<typeof Bun.spawn> | undefined;
			let helperReady = false;
			let seededProjectId: string | undefined;
			try {
				await mkdir(userData, { recursive: true });
				await cp(resolve(preview!), application, { recursive: true, verbatimSymlinks: true });
				expect(
					(await readFile(join(contents, "Resources/host-service.cjs"), "utf8")).includes("TRELLIS_DESKTOP_USER_DATA"),
					"Rebuild the package before this isolated service test.",
				).toBe(true);
				if (useExisting) {
					const resources = join(contents, "Resources/host");
					const seed = await connectHost({
						home,
						executable: join(resources, "bin/bun"),
						entry: join(resources, "apps/server/src/index.ts"),
						webDist: join(resources, "apps/web/dist"),
					});
					try {
						const response = await fetch(`${seed.origin}/api/projects`, {
							method: "POST",
							headers: {
								Authorization: `Bearer ${seed.token}`,
								"content-type": "application/json",
								"x-trellis-actor": "human:desktop-preview",
							},
							body: JSON.stringify({ key: "SAME", name: "Existing desktop data" }),
						});
						expect(response.status).toBe(201);
						seededProjectId = ((await response.json()) as { id: string }).id;
					} finally {
						process.kill(seed.pid, "SIGTERM");
						await waitForHostExit(home);
					}
				}
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
 if (options.message === "Choose Trellis data") return {response: ${useExisting ? 1 : 0}};
 if (options.message === "Use this Trellis data directory?") { previewResult.confirmation = options; return {response: 1}; }
 throw new Error("Unexpected preview prompt: " + options.message);
};
previewElectron.dialog.showOpenDialog = async (options) => {
 if (options.title !== "Choose a Trellis data directory") throw new Error("Unexpected preview picker: " + options.title);
 return {canceled: false, filePaths: [${JSON.stringify(home)}]};
};
previewElectron.app.relaunch = () => previewFs.writeFileSync(${JSON.stringify(relaunchPath)}, JSON.stringify(previewResult));
previewElectron.dialog.showErrorBox = (title, message) => {
 previewFs.writeFileSync(${JSON.stringify(errorPath)}, JSON.stringify({title, message, ...previewResult}));
 previewElectron.app.exit(1);
};
previewElectron.app.on("browser-window-created", (_event, window) => {
 window.once("ready-to-show", () => {
  if (window.webContents.getURL().endsWith("/startup.html")) {
   previewResult.progressSeen = true;
   return;
  }
  setImmediate(async () => {
  await Promise.all(previewElectron.BrowserWindow.getAllWindows().filter(other => other !== window).map(other => new Promise(resolve => other.once("closed", resolve))));
  previewResult.openWindows = previewElectron.BrowserWindow.getAllWindows().length;
  previewResult.url = window.webContents.getURL();
  previewResult.windowButtons = window.getWindowButtonPosition();
  previewResult.windowBounds = window.getBounds();
  previewResult.contentBounds = window.getContentBounds();
  previewFs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(previewResult));
  previewElectron.app.quit();
  });
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
<key>EnvironmentVariables</key><dict><key>TRELLIS_DESKTOP_USER_DATA</key><string>${userData}</string><key>HOME</key><string>${join(directory, "system-home")}</string></dict>
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
				for (let attempt = 0; attempt < (useExisting ? 2 : 1); attempt++) {
					desktop = Bun.spawn([join(contents, "MacOS/Trellis")], {
						env: { ...process.env, TRELLIS_DESKTOP_HOME: undefined },
						stdout: "pipe",
						stderr: "pipe",
					});
					const deadline = Date.now() + 120000;
					while (
						!existsSync(resultPath) &&
						!existsSync(errorPath) &&
						desktop.exitCode === null &&
						Date.now() < deadline
					)
						await Bun.sleep(100);
					if (desktop.exitCode === null && !existsSync(resultPath)) {
						desktop.kill("SIGTERM");
						await desktop.exited;
					}
					const stderr = await new Response(desktop.stderr as ReadableStream).text();
					expect(existsSync(errorPath) ? await readFile(errorPath, "utf8") : "", stderr).toBe("");
					expect(await desktop.exited, stderr).toBe(0);
					if (existsSync(resultPath)) break;
					expect(existsSync(relaunchPath), stderr).toBe(true);
				}
				expect(existsSync(resultPath)).toBe(true);
				const result = JSON.parse(await readFile(resultPath, "utf8"));
				console.log(JSON.stringify(result));
				expect(result.defaultUserData).toBe(join(result.appData, "Trellis"));
				expect(result.order).toEqual(["data", "lock"]);
				expect(result.lockSawUserData).toBe(userData);
				expect(result.progressSeen).toBe(true);
				expect(result.openWindows).toBe(1);
				expect(result.windowButtons).toEqual({ x: 16, y: 20 });
				expect(result.contentBounds.height).toBe(result.windowBounds.height);
				const host = await adoptHost(home);
				expect(result.url).toBe(`${host.origin}/`);
				expect((await serviceCommand(helper, "status")).status).toBe("enabled");
				expect(await desktop!.exited).toBe(0);
				if (useExisting) {
					const selection = JSON.parse(await readFile(join(userData, "selected-home.json"), "utf8"));
					expect(selection.home).toBe(await realpath(home));
					const relaunch = JSON.parse(await readFile(relaunchPath, "utf8"));
					expect(relaunch.confirmation.detail).toContain(`Current directory: ${originalHome}`);
					expect(relaunch.confirmation.detail).toContain(`Selected directory: ${selection.home}`);
					const backup = relaunch.confirmation.detail
						.split("\n\n")
						.find((line: string) => line.startsWith("Backup: "))
						.slice(8);
					expect(backup.startsWith(join(selection.home, "backups/desktop-handoff-"))).toBe(true);
					expect(existsSync(join(backup, "backup.json"))).toBe(true);
					expect(existsSync(join(originalHome, "db"))).toBe(false);
					const project = await fetch(`${host.origin}/api/projects/SAME`, {
						headers: { Authorization: `Bearer ${host.token}` },
					});
					expect(project.status).toBe(200);
					const existing = (await project.json()) as { id: string; name: string };
					expect(existing.id).toBe(seededProjectId!);
					expect(existing.name).toBe("Existing desktop data");
					const active = JSON.parse(await readFile(join(home, "desktop-active-release.json"), "utf8"));
					expect(existsSync(join(userData, "releases", active.id, "release.json"))).toBe(true);
					expect(existsSync(join(home, "releases"))).toBe(false);
				}
			} finally {
				if (desktop && desktop.exitCode === null) {
					desktop.kill("SIGTERM");
					await desktop.exited;
				}
				if (helperReady) {
					const status = (await serviceCommand(helper, "status")).status;
					if (status === "enabled" || status === "requiresApproval") {
						await serviceCommand(helper, "unregister");
						await waitForHostExit(home);
					}
				}
				await rm(directory, { recursive: true, force: true });
			}
		},
		300000,
	);
