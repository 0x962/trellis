import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { restartMenuItem } from "../../src/restartMenuItem/index.ts";
import { startupProgress } from "../../src/startupProgress/index.ts";

app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
	const profile = () => process.argv[3]!;
	const progress = startupProgress(process.argv[2]!, profile);
	const snapshot = () =>
		BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(`({
		phase: document.getElementById("phase").textContent,
		steps: document.getElementById("steps").textContent,
		remaining: document.getElementById("remaining").textContent,
		elapsed: document.getElementById("elapsed"),
		progress: document.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"),
		live: document.querySelector('[role="status"]').getAttribute("aria-live"),
		opacity: getComputedStyle(document.querySelector("main")).opacity,
		motion: getComputedStyle(document.querySelector("main")).transitionDuration,
		require: typeof require, process: typeof process
	})`);
	await progress.show("Prepare restart");
	const initial = await snapshot();
	const firstWindow = BrowserWindow.getAllWindows()[0]!;
	const titleBar = firstWindow.getWindowButtonPosition();
	await progress.show("Stop background host");
	const host = await snapshot();
	await progress.show("Relaunch desktop");
	await progress.handoff();
	const handoff = {
		windows: BrowserWindow.getAllWindows().length,
		saved: existsSync(join(profile(), "restart-progress.json")),
	};
	const resumed = startupProgress(process.argv[2]!, profile);
	await resumed.show("Prepare Trellis");
	const resume = await snapshot();
	await resumed.show("Restore agent sessions");
	await resumed.show("Open Trellis");
	const last = await snapshot();
	const window = BrowserWindow.getAllWindows()[0]!;
	window.webContents.debugger.attach("1.3");
	await window.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
		features: [{ name: "prefers-reduced-motion", value: "reduce" }],
	});
	const reduced = await snapshot();
	window.webContents.debugger.detach();
	let revealAboveMain = false;
	await resumed.finish(() => {
		revealAboveMain = window.isAlwaysOnTop();
	});
	const finished = {
		revealAboveMain,
		windows: BrowserWindow.getAllWindows().length,
		saved: existsSync(join(profile(), "restart-progress.json")),
		history: existsSync(join(profile(), "startup-timings.json")),
	};
	const errors: string[] = [];
	const item = { enabled: true };
	await restartMenuItem(
		{ relaunch: () => errors.push("unexpected relaunch"), quit: () => errors.push("unexpected quit") },
		async () => {
			throw new Error("Host failed");
		},
		(error) => errors.push(error.message),
		resumed,
	).click(item);
	console.log(
		JSON.stringify({
			initial,
			host,
			titleBar,
			handoff,
			resume,
			last,
			reduced,
			finished,
			afterError: BrowserWindow.getAllWindows().length,
			errors,
			enabled: item.enabled,
		}),
	);
	app.quit();
});
