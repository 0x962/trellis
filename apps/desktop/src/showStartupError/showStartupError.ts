import { app, dialog } from "electron";

export const showStartupError = async (error: Error) => {
	await dialog.showMessageBox({
		type: "error",
		message: "Trellis cannot start",
		detail: error.message,
		buttons: ["Quit"],
		defaultId: 0,
		cancelId: 0,
	});
	app.quit();
};
