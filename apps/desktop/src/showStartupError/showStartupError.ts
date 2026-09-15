import { app, dialog } from "electron";
import { readConfiguredHome } from "../selectedHome/selectedHome.ts";

export const showStartupError = async (error: Error, chooseHome: (home: string) => Promise<unknown>) => {
	const { response } = await dialog.showMessageBox({
		type: "error",
		message: "Trellis cannot start",
		detail: error.message,
		buttons: app.isPackaged ? ["Quit", "Choose data directory…"] : ["Quit"],
		defaultId: 0,
		cancelId: 0,
	});
	if (response === 1) {
		try {
			await chooseHome(readConfiguredHome(app.getPath("userData")));
		} catch (selectionError) {
			dialog.showErrorBox("The saved data directory needs attention", (selectionError as Error).message);
		}
	}
	app.quit();
};
