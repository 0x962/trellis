import { homedir } from "node:os";
import { join, resolve } from "node:path";

// The files `install` writes and `uninstall` removes. `prefix` moves the
// shim and the LaunchAgents directory under a test root. The data home is
// TRELLIS_HOME, or ~/.trellis when it is unset. The plist gives the same
// data home to the server, so the agent serves the home the CLI run names.
export const installationPaths = (env: Record<string, string | undefined>, prefix?: string) => {
	const userHome = homedir();
	const installHome = prefix === undefined ? userHome : resolve(prefix);
	const dataHome = resolve(env.TRELLIS_HOME ?? join(userHome, ".trellis"));
	const repoRoot = resolve(import.meta.dir, "../../..");
	return {
		userHome,
		dataHome,
		repoRoot,
		cliEntry: join(repoRoot, "packages", "cli", "src", "index.ts"),
		serverEntry: join(repoRoot, "apps", "server", "src", "index.ts"),
		webDir: join(repoRoot, "apps", "web"),
		webDist: join(repoRoot, "apps", "web", "dist"),
		shim: join(installHome, ".local", "bin", "trellis"),
		plist: join(installHome, "Library", "LaunchAgents", "com.trellis.server.plist"),
		gateway: join(userHome, "projects", "margin", "src", "gateway.ts"),
		log: join(dataHome, "server.log"),
	};
};
