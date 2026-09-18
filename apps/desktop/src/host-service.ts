import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { assertHostStopped, ensureHostToken } from "./host/host.ts";
import { pinResources } from "./pinnedResources/pinnedResources.ts";
import { pruneReleases } from "./pruneReleases/pruneReleases.ts";
import { defaultDesktopUserData, readSelectedHome } from "./selectedHome/selectedHome.ts";
import { chooseHostRelease, recordActiveRelease } from "./updateStatus/updateStatus.ts";

const start = async () => {
	const resources = dirname(process.argv[1]!);
	const source = join(resources, "host");
	const override = process.env.TRELLIS_DESKTOP_HOME;
	const userData = process.env.TRELLIS_DESKTOP_USER_DATA ?? (override ? dirname(override) : defaultDesktopUserData());
	const home = override ?? readSelectedHome(userData);
	assertHostStopped(home);
	const token = ensureHostToken(home);
	const available = await pinResources(source, userData);
	const release = await chooseHostRelease(home, available);
	const root = release.root;
	const lock = join(home, "trellis.lock");
	const owner = existsSync(lock) ? JSON.parse(readFileSync(lock, "utf8")) : undefined;
	writeFileSync(join(home, "desktop-service.pid"), String(process.pid), { mode: 0o600 });
	await recordActiveRelease(home, release);
	pruneReleases(join(userData, "releases"), [release.manifest.id, available.manifest.id]);
	process.execve!(join(root, "bin/bun"), [join(root, "bin/bun"), join(root, "apps/server/src/index.ts")], {
		...process.env,
		TRELLIS_EXECUTION_SHELL: userInfo().shell!,
		TRELLIS_EXECUTION_BIN: join(root, "bin"),
		TRELLIS_HOME: home,
		TRELLIS_RELEASE_ID: release.manifest.id,
		TRELLIS_HOST: "127.0.0.1",
		TRELLIS_PORT: owner?.role === "server" && owner.port ? String(owner.port) : "0",
		TRELLIS_AUTH_TOKEN: token,
		TRELLIS_WEB_DIST: join(root, "apps/web/dist"),
		TRELLIS_RUNTIME_NODE: join(root, "bin/node"),
		TRELLIS_RUNTIME_SCRIPT: join(root, "apps/runtime/dist/index.js"),
		TRELLIS_CODEX_BRIDGE: join(root, "apps/server/dist/codex-bridge.js"),
		TRELLIS_MUSE_BRIDGE: join(root, "apps/server/dist/muse-bridge.js"),
	});
};
void start();
