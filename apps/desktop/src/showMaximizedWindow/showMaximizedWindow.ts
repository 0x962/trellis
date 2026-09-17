type DesktopWindow = {
	isMinimized: () => boolean;
	restore: () => void;
	isFullScreen: () => boolean;
	setFullScreen: (fullscreen: boolean) => void;
	once: (event: "leave-full-screen", callback: () => void) => unknown;
	maximize: () => void;
	show: () => void;
	focus: () => void;
};

export function showMaximizedWindow(window: DesktopWindow) {
	if (window.isMinimized()) window.restore();
	const show = () => {
		window.maximize();
		window.show();
		window.focus();
	};
	if (window.isFullScreen()) {
		window.once("leave-full-screen", show);
		window.setFullScreen(false);
	} else show();
}
