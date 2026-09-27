export async function stopProcessTree(sessionId: number) {
	if (process.platform === "linux") {
		const { stopLinuxProcessTree } = await import("./platform/linuxLifecycle/index.ts");
		return stopLinuxProcessTree(sessionId);
	}
	if (process.platform === "darwin") {
		const { stopDarwinProcessTree } = await import("./platform/darwinLifecycle/index.ts");
		return stopDarwinProcessTree(sessionId);
	}
	throw new Error(`Process stop does not support ${process.platform}`);
}
