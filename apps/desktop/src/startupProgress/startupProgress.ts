import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { progressRun } from "../progressRun/index.ts";

export const startupProgress = (page: string, profile = () => app.getPath("userData")) => {
	let window: BrowserWindow | undefined;
	let rendererReady = false;
	let run: ReturnType<typeof progressRun> | undefined;
	const historyPath = () => join(profile(), "startup-timings.json");
	const render = () =>
		window!.webContents.executeJavaScript(`window.trellisProgress.update(${JSON.stringify(run!.view(Date.now()))})`);
	const dismiss = async () => {
		if (!window) return;
		const closing = window;
		if (rendererReady) await closing.webContents.executeJavaScript("window.trellisProgress.disappear()");
		closing.setProgressBar(-1);
		closing.destroy();
		window = undefined;
		rendererReady = false;
	};
	const saveHistory = () => writeFile(historyPath(), JSON.stringify(run!.state.history));
	const close = async () => {
		if (run) await saveHistory();
		await dismiss();
		run = undefined;
	};
	return {
		// The phase and the stage of the last report. `close` drops them, so a
		// failed startup reads them before it closes the window.
		step: () => {
			if (!run) return undefined;
			const view = run.view(Date.now());
			return { phase: view.phase, stage: view.stage };
		},
		show: async (stage: string) => {
			if (!run) {
				const history = existsSync(historyPath()) ? JSON.parse(await readFile(historyPath(), "utf8")) : {};
				run = progressRun({ now: Date.now(), history });
			}
			run.report(stage, Date.now());
			const opening = !window;
			if (!window) {
				window = new BrowserWindow({
					width: 460,
					height: 212,
					show: false,
					title: "Trellis",
					frame: false,
					transparent: true,
					hasShadow: false,
					resizable: false,
					minimizable: false,
					maximizable: false,
					closable: false,
					fullscreenable: false,
					webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
				});
				window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
				window.webContents.on("will-navigate", (event) => event.preventDefault());
				await window.loadFile(page);
				rendererReady = true;
			}
			await render();
			window.setProgressBar(run.view(Date.now()).progress);
			if (opening) {
				window.show();
				await window.webContents.executeJavaScript("window.trellisProgress.appear()");
			}
		},
		finish: async (reveal: () => void) => {
			window?.setAlwaysOnTop(true);
			reveal();
			if (run && window) {
				run.complete(Date.now());
				await render();
				await window.webContents.executeJavaScript("window.trellisProgress.settle()");
			}
			await close();
		},
		close,
	};
};
