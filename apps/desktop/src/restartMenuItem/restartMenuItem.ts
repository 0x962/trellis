import type { App, MenuItem } from "electron";

export const restartMenuItem = (
	app: Pick<App, "relaunch" | "quit">,
	restart: () => Promise<unknown>,
	showError: (error: Error) => void,
	progress: { show: (stage: string) => Promise<void>; close: () => Promise<void>; handoff: () => Promise<void> },
) => ({
	label: "Restart",
	click: async (item: Pick<MenuItem, "enabled">) => {
		item.enabled = false;
		try {
			await progress.show("Prepare restart");
			await restart();
			await progress.show("Relaunch desktop");
			await progress.handoff();
			app.relaunch();
			app.quit();
		} catch (error) {
			await progress.close();
			item.enabled = true;
			showError(error as Error);
		}
	},
});
