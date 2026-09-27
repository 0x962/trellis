import { join } from "node:path";
import type { LinuxRelease, LinuxServiceInstallation } from "../types/index.ts";

const environmentValue = (value: string) => JSON.stringify(value);

export const hostEnvironment = (
	release: LinuxRelease,
	installation: LinuxServiceInstallation,
	authToken: string,
	env: Record<string, string | undefined>,
) => ({
	TRELLIS_HOME: installation.dataHome,
	TRELLIS_HOST: installation.host,
	TRELLIS_PORT: String(installation.port),
	TRELLIS_AUTH_TOKEN: authToken,
	TRELLIS_RELEASE_ID: release.manifest.releaseId,
	TRELLIS_WEB_DIST: join(release.root, "apps", "web", "dist"),
	TRELLIS_RUNTIME_NODE: join(release.root, release.manifest.entrypoints.node),
	TRELLIS_RUNTIME_SCRIPT: join(release.root, "apps", "runtime", "dist", "index.js"),
	TRELLIS_EXECUTION_BIN: join(release.root, "bin"),
	TRELLIS_EXECUTION_SHELL: env.TRELLIS_EXECUTION_SHELL ?? env.SHELL ?? "/bin/sh",
	TRELLIS_RUNTIME_MODE: "supervised",
	TRELLIS_CODEX_BRIDGE: join(release.root, "apps", "server", "dist", "codex-bridge.js"),
	TRELLIS_MUSE_BRIDGE: join(release.root, "apps", "server", "dist", "muse-bridge.js"),
});

export const environmentFileText = (environment: Record<string, string>) =>
	`${Object.entries(environment)
		.map(([name, value]) => `${name}=${environmentValue(value)}`)
		.join("\n")}\n`;
