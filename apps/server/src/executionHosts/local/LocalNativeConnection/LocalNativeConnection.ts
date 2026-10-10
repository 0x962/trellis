import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { ensureNativeRuntime, nativeClient } from "../../../agents/native/connection.ts";

export type LocalNativeConnection = {
	// The Unix socket of the local runtime under `home`.
	socketPath: string;
	// A client of that socket. The runtime may be absent.
	client(): RuntimeClient;
	// A client of a runtime that answers. An absent runtime is started first.
	ensure(): Promise<RuntimeClient>;
};

// The connection of the server to the runtime of one data home. The socket
// path equals the path `nativeClient(home)` uses: the fingerprint of every
// prepared launch record under `home/harness-attempts` embeds that path, and
// a resume of an older attempt fails on a different one.
export const createLocalNativeConnection = (home: string): LocalNativeConnection => {
	const client = nativeClient(home);
	return {
		socketPath: client.socketPath,
		client: () => client,
		ensure: () => ensureNativeRuntime(home),
	};
};
