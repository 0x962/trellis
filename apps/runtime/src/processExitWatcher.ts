import { type ExitWatcher, platform } from "./platform/index.ts";

export class ProcessExitWatcher implements ExitWatcher {
	private readonly watcher = platform.createExitWatcher();
	watch(pid: number, listener: () => void) {
		this.watcher.watch(pid, listener);
	}
	close() {
		this.watcher.close();
	}
}
