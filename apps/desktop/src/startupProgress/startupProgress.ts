import { BrowserWindow } from "electron";

export const startupProgress = (page: string) => {
	let window: BrowserWindow | undefined;
	return {
		show: async (stage: string) => {
			if (!window) {
				window = new BrowserWindow({
					width: 440,
					height: 240,
					show: false,
					title: "Trellis",
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
			}
			await window.webContents.executeJavaScript(
				`document.getElementById("stage").textContent = ${JSON.stringify(stage)}`,
			);
			window.setProgressBar(2);
			window.show();
		},
		close: () => {
			window?.setProgressBar(-1);
			window?.destroy();
			window = undefined;
		},
	};
};
