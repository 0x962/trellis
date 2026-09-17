import type { App } from "electron";

export const restartMenuItem = (app: Pick<App, "exit" | "relaunch">) => ({
	label: "Restart",
	click: () => {
		app.relaunch();
		app.exit(0);
	},
});
