import { join } from "node:path";
import type { LinuxRelease, LinuxServiceInstallation } from "../types/index.ts";

const quote = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

export const runtimeSystemdUnit = (release: LinuxRelease, installation: LinuxServiceInstallation) => {
	const executable = quote(join(release.root, release.manifest.entrypoints.runtime));
	const runtimeHome = quote(join(installation.dataHome, "runtime"));
	const runtimeSocket = quote(join(installation.dataHome, "runtime", "runtime.sock"));
	return `[Unit]
Description=Trellis execution runtime

[Service]
Type=simple
UMask=0077
Delegate=yes
Environment=${quote(`TRELLIS_RELEASE_ID=${release.manifest.releaseId}`)}
ExecStart=${executable} --home ${runtimeHome}
ExecStartPost=/bin/sh -c 'until [ -S "$1" ]; do sleep 0.05; done' sh ${runtimeSocket}
TimeoutStartSec=10
Restart=no

[Install]
WantedBy=default.target
`;
};

export const hostSystemdUnit = (
	release: LinuxRelease,
	installation: LinuxServiceInstallation,
	environmentPath: string,
) => {
	const executable = quote(join(release.root, release.manifest.entrypoints.server));
	return `[Unit]
Description=Trellis host
Wants=trellis-runtime.service
Requires=trellis-runtime.service
After=trellis-runtime.service

[Service]
Type=simple
UMask=0077
EnvironmentFile=${quote(environmentPath)}
ExecStart=${executable}
Restart=no

[Install]
WantedBy=default.target
`;
};
