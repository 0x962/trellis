import { existsSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// PGlite runs initdb in the calling process when it opens a data directory
// that holds no cluster. initdb grows the process to about 1.3 GB of
// resident memory, and the process keeps that memory until it exits. So a
// child process creates the cluster and exits, and the server then opens a
// directory that already holds a cluster. `PG_VERSION` is the file initdb
// writes into every cluster directory.
export const initCluster = async (dataDir: string) => {
	if (existsSync(join(dataDir, "PG_VERSION"))) return;
	const child = Bun.spawn([process.execPath, import.meta.path, dataDir], { stdout: "ignore", stderr: "pipe" });
	const code = await child.exited;
	if (code !== 0) throw new Error(`initdb in ${dataDir} exited ${code}: ${await new Response(child.stderr).text()}`);
};

if (import.meta.main) {
	const client = await PGlite.create({ dataDir: process.argv[2]! });
	await client.close();
}
