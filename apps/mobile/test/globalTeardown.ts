import type { ChildProcess } from "node:child_process";

// SIGTERM says bye on every stream and closes the database, so the run
// leaves no server behind and no PGlite data directory in use.
export default async () => {
	const child = (globalThis as { trellisServer?: ChildProcess }).trellisServer;
	if (child === undefined || child.exitCode !== null) return;
	await new Promise<void>((resolve) => {
		child.on("exit", () => resolve());
		child.kill("SIGTERM");
	});
};
