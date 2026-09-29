import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { AuthorityPort, HostControlIdentity } from "../../langflowHost";

export function authorityTransport(transport: ServiceTransport, identity: HostControlIdentity): AuthorityPort {
	const call = <K extends keyof AuthorityPort>(operation: K, input: Parameters<AuthorityPort[K]>[0]) =>
		transport.call("langflowHost.authority", systemContext(), {
			hostId: identity.hostId,
			dataHomeId: identity.dataHomeId,
			operation,
			input,
		}) as ReturnType<AuthorityPort[K]>;
	return {
		revokeOwner: (input) => call("revokeOwner", input),
		readRevocation: (input) => call("readRevocation", input),
		readReceipt: (input) => call("readReceipt", input),
		read: (input) => call("read", input),
		commit: (input) => call("commit", input),
	};
}
