const { app, BrowserWindow } = require("electron");
app.whenReady().then(async () => {
	const window = new BrowserWindow({
		show: false,
		webPreferences: { preload: process.argv[2], contextIsolation: true, nodeIntegration: false, sandbox: true },
	});
	await window.loadURL("data:text/html,<title>Trellis preload probe</title>");
	const result = await window.webContents.executeJavaScript(
		"JSON.stringify({ bridge: Object.keys(window.trellisDesktop), platform: window.trellisDesktop.platform, require: typeof require, process: typeof process })",
	);
	console.log(result);
	app.quit();
});
