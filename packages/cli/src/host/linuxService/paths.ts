import { join, resolve } from "node:path";

export const linuxServicePaths = (home: string) => {
	const configRoot = join(home, ".config", "trellis");
	return {
		configRoot,
		environment: join(configRoot, "host.env"),
		installation: join(configRoot, "host-service.json"),
		token: join(configRoot, "host-token"),
		unitRoot: join(home, ".config", "systemd", "user"),
		hostUnit: join(home, ".config", "systemd", "user", "trellis-host.service"),
		runtimeUnit: join(home, ".config", "systemd", "user", "trellis-runtime.service"),
		defaultDataHome: resolve(home, ".trellis"),
	};
};
