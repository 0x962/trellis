import type { App, MenuItem } from "electron";

export const restartMenuItem = (
	app: Pick<App, "relaunch" | "quit">,
	restart: () => Promise<unknown>,
	showError: (error: Error) => void,
) => ({
	label: "Restart",
	click: async (item: Pick<MenuItem, "enabled">) => {
		item.enabled = false;
		try {
			await restart();
			app.relaunch();
			app.quit();
		} catch (error) {
			item.enabled = true;
			showError(error as Error);
		}
	},
});
