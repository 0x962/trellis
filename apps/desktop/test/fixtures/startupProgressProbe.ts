import { app, BrowserWindow } from "electron";
import { restartMenuItem } from "../../src/restartMenuItem/index.ts";
import { startupProgress } from "../../src/startupProgress/index.ts";

app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
	const progress = startupProgress(process.argv[2]!);
	await progress.show("Wait for background host");
	const window = BrowserWindow.getAllWindows()[0]!;
	const snapshot = () =>
		window.webContents.executeJavaScript(`({
			stage: document.getElementById("stage").textContent,
			elapsed: document.getElementById("elapsed").textContent,
			require: typeof require,
			process: typeof process,
			live: document.querySelector('[role="status"]').getAttribute("aria-live")
		})`);
	const initial = await snapshot();
	await new Promise((resolve) => setTimeout(resolve, 1200));
	await progress.show("Restore agent sessions");
	const restored = await snapshot();
	const visible = window.isVisible();
	const count = BrowserWindow.getAllWindows().length;
	progress.close();
	const closed = BrowserWindow.getAllWindows().length;
	const errors: string[] = [];
	const item = { enabled: true };
	await restartMenuItem(
		{ relaunch: () => errors.push("unexpected relaunch"), quit: () => errors.push("unexpected quit") },
		async () => {
			throw new Error("Host failed");
		},
		(error) => errors.push(error.message),
		progress,
	).click(item);
	console.log(
		JSON.stringify({
			initial,
			restored,
			visible,
			count,
			closed,
			afterError: BrowserWindow.getAllWindows().length,
			errors,
			enabled: item.enabled,
		}),
	);
	app.quit();
});
