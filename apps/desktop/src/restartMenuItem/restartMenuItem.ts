type RestartApp = {
	relaunch: () => void;
	exit: (exitCode?: number) => void;
};

type RestartHost = {
	restart: () => Promise<void>;
	showError: (error: Error) => void;
};

export const restartMenuItem = (app: RestartApp, host?: RestartHost) => {
	const relaunch = () => {
		app.relaunch();
		app.exit(0);
	};
	return {
		label: "Restart",
		click: () => {
			if (!host) {
				relaunch();
				return;
			}
			return host.restart().then(relaunch).catch(host.showError);
		},
	};
};
