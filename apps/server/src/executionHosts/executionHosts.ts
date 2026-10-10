import type { ExecutionHost } from "@trellis/runtime-protocol/execution";
import {
	createLocalExecutionHost,
	type LocalExecutionHost,
	type LocalExecutionHostInput,
} from "./local/LocalExecutionHost";
import { UnknownExecutionHost } from "./UnknownExecutionHost";

export type ExecutionHosts = {
	// The host that serves `hostId`.
	get(hostId: string): ExecutionHost;
	local: LocalExecutionHost;
};

// Every execution host this server reaches, by host id. The local host is
// the one entry.
export function createExecutionHosts(input: { local: LocalExecutionHostInput }): ExecutionHosts {
	const local = createLocalExecutionHost(input.local);
	const hosts = new Map<string, ExecutionHost>([[local.binding.hostId, local]]);
	return {
		local,
		get(hostId) {
			const host = hosts.get(hostId);
			if (host === undefined) throw new UnknownExecutionHost(hostId);
			return host;
		},
	};
}
