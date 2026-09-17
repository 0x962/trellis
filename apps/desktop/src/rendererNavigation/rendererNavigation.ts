export const createRendererNavigation = (send: (path: string) => void) => {
	let ready = false;
	let pendingPath: string | undefined;

	return {
		initialPath: () => {
			const path = pendingPath ?? "/";
			pendingPath = undefined;
			return path;
		},
		navigate: (path: string) => {
			if (ready) send(path);
			else pendingPath = path;
		},
		rendererReady: () => {
			ready = true;
			if (pendingPath) {
				send(pendingPath);
				pendingPath = undefined;
			}
		},
		startLoad: () => {
			ready = false;
		},
	};
};
