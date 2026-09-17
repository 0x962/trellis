import { connectHost, type HostOptions, waitForHostExit } from "../host/host.ts";

export const restartHost = async (options: HostOptions) => {
	const host = await connectHost(options);
	process.kill(host.pid, "SIGTERM");
	await waitForHostExit(options.home);
	return connectHost(options);
};
