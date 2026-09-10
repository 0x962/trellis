import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const installationPaths = (prefix?: string) => {
	const userHome = homedir();
	const installHome = prefix === undefined ? userHome : resolve(prefix);
	const repoRoot = resolve(import.meta.dir, "../../..");
	return {
		userHome,
		repoRoot,
		cliEntry: join(repoRoot, "packages", "cli", "src", "index.ts"),
		serverEntry: join(repoRoot, "apps", "server", "src", "index.ts"),
		webDir: join(repoRoot, "apps", "web"),
		webDist: join(repoRoot, "apps", "web", "dist"),
		shim: join(installHome, ".local", "bin", "trellis"),
		plist: join(installHome, "Library", "LaunchAgents", "com.trellis.server.plist"),
		gateway: join(userHome, "projects", "margin", "src", "gateway.ts"),
		log: join(userHome, ".trellis", "server.log"),
	};
};
