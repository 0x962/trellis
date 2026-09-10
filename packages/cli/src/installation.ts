import { join, resolve } from "node:path";

// The files `install` writes and `uninstall` removes, all under `home`, the
// user home the CLI deps carry. `prefix` moves the shim and the LaunchAgents
// directory under a test root. The data home is TRELLIS_HOME, or
// `<home>/.trellis` when it is unset. The plist gives the same data home to
// the server, so the agent serves the home the CLI run names.
export const installationPaths = (env: Record<string, string | undefined>, home: string, prefix?: string) => {
	const installHome = prefix === undefined ? home : resolve(prefix);
	const dataHome = resolve(env.TRELLIS_HOME ?? join(home, ".trellis"));
	const repoRoot = resolve(import.meta.dir, "../../..");
	return {
		userHome: home,
		dataHome,
		repoRoot,
		cliEntry: join(repoRoot, "packages", "cli", "src", "index.ts"),
		serverEntry: join(repoRoot, "apps", "server", "src", "index.ts"),
		restoreEntry: join(repoRoot, "apps", "server", "src", "restore.ts"),
		webDir: join(repoRoot, "apps", "web"),
		webDist: join(repoRoot, "apps", "web", "dist"),
		shim: join(installHome, ".local", "bin", "trellis"),
		plist: join(installHome, "Library", "LaunchAgents", "com.trellis.server.plist"),
		gateway: join(home, "projects", "margin", "src", "gateway.ts"),
		log: join(dataHome, "server.log"),
	};
};
