import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { AuthorityPort, HostControlIdentity, InitialBindingPort } from "../../langflowHost";

export function authorityTransport(transport: ServiceTransport, identity: HostControlIdentity): AuthorityPort & InitialBindingPort {
	const call = <K extends keyof (AuthorityPort & InitialBindingPort)>(operation: K, input: Parameters<(AuthorityPort & InitialBindingPort)[K]>[0]) =>
		transport.call("langflowHost.authority", systemContext(), {
			hostId: identity.hostId,
			dataHomeId: identity.dataHomeId,
			operation,
			input,
		}) as ReturnType<(AuthorityPort & InitialBindingPort)[K]>;
	return {
		recoverInitialBinding: (input) => call("recoverInitialBinding", input),
		revokeOwner: (input) => call("revokeOwner", input),
		readRevocation: (input) => call("readRevocation", input),
		readReceipt: (input) => call("readReceipt", input),
		read: (input) => call("read", input),
		commit: (input) => call("commit", input),
	};
}
