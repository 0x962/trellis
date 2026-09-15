import { existsSync, watch } from "node:fs";
import { dirname } from "node:path";

export function waitForNativeHarnessFile(path: string) {
	return new Promise<void>((resolve, reject) => {
		const finish = (error?: Error) => {
			clearTimeout(timer);
			watcher.close();
			if (error) reject(error);
			else resolve();
		};
		const inspect = () => {
			if (existsSync(path)) finish();
		};
		const watcher = watch(dirname(path), inspect);
		const timer = setTimeout(() => finish(new Error(`Native command did not create ${path}`)), 90_000);
		watcher.once("error", finish);
		inspect();
	});
}
