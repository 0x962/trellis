type RestartApp = {
	relaunch: () => void;
	exit: (exitCode?: number) => void;
};

export const restartMenuItem = (app: RestartApp) => ({
	label: "Restart",
	click: () => {
		app.relaunch();
		app.exit(0);
	},
});
