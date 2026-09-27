type ExitWatcher = {
	watch: (pid: number, listener: () => void) => void;
	close: () => void;
};

const createPlatformProcessExitWatcher =
	process.platform === "darwin"
		? (await import("./platform/darwinLifecycle/index.ts")).createDarwinProcessExitWatcher
		: process.platform === "linux"
			? (await import("./platform/linuxLifecycle/index.ts")).createLinuxProcessExitWatcher
			: undefined;

export class ProcessExitWatcher implements ExitWatcher {
	private readonly watcher: ExitWatcher;

	constructor() {
		if (createPlatformProcessExitWatcher === undefined)
			throw new Error(`Process exit observation does not support ${process.platform}`);
		this.watcher = createPlatformProcessExitWatcher();
	}

	watch(pid: number, listener: () => void) {
		this.watcher.watch(pid, listener);
	}

	close() {
		this.watcher.close();
	}
}
