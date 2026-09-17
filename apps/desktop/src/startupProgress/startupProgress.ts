import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { type ProgressState, progressRun } from "../progressRun/index.ts";

export const startupProgress = (page: string, profile = () => app.getPath("userData")) => {
	let window: BrowserWindow | undefined;
	let rendererReady = false;
	let run: ReturnType<typeof progressRun> | undefined;
	const checkpointPath = () => join(profile(), "restart-progress.json");
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
		if (run) {
			await saveHistory();
			await rm(checkpointPath(), { force: true });
		}
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
			if (!run || stage === "Prepare restart") {
				const checkpoint =
					stage === "Prepare Trellis" && existsSync(checkpointPath())
						? (JSON.parse(await readFile(checkpointPath(), "utf8")) as ProgressState)
						: undefined;
				const history = existsSync(historyPath()) ? JSON.parse(await readFile(historyPath(), "utf8")) : {};
				run = checkpoint
					? progressRun({ checkpoint })
					: progressRun({ mode: stage === "Prepare restart" ? "restart" : "startup", now: Date.now(), history });
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
		handoff: async () => {
			await writeFile(checkpointPath(), JSON.stringify(run!.state));
			await saveHistory();
			await dismiss();
			run = undefined;
		},
		close,
	};
};
