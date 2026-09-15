import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { assertHostStopped, ensureHostToken } from "./host/host.ts";
import { loginEnvironment } from "./loginEnvironment/loginEnvironment.ts";
import { pinResources } from "./pinnedResources/pinnedResources.ts";
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
	const env = await loginEnvironment(userInfo().shell!, join(root, "bin"));
	const lock = join(home, "trellis.lock");
	const owner = existsSync(lock) ? JSON.parse(readFileSync(lock, "utf8")) : undefined;
	writeFileSync(join(home, "desktop-service.pid"), String(process.pid), { mode: 0o600 });
	await recordActiveRelease(home, release);
	process.execve!(join(root, "bin/bun"), [join(root, "bin/bun"), join(root, "apps/server/src/index.ts")], {
		...env,
		TRELLIS_HOME: home,
		TRELLIS_HOST: "127.0.0.1",
		TRELLIS_PORT: owner?.role === "server" && owner.port ? String(owner.port) : "0",
		TRELLIS_AUTH_TOKEN: token,
		TRELLIS_WEB_DIST: join(root, "apps/web/dist"),
		TRELLIS_RUNTIME_NODE: join(root, "bin/node"),
		TRELLIS_RUNTIME_SCRIPT: join(root, "apps/runtime/dist/index.js"),
	});
};
void start();
