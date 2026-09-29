import { createAuthorityPort, type AuthorityPort, type InitialBindingPort } from "../../../langflowHost";
import type { IoCtx } from "../../support";
import { actionControl } from "../actionControl";

type HostAuthorityPort = AuthorityPort & InitialBindingPort;

type AuthorityOperation = {
	[K in keyof HostAuthorityPort]: { operation: K; input: Parameters<HostAuthorityPort[K]>[0] };
}[keyof HostAuthorityPort];
export type HostAuthorityInput = AuthorityOperation & { hostId: string; dataHomeId: string };

export async function hostAuthority(ctx: IoCtx, input: HostAuthorityInput) {
	if (ctx.actor.kind !== "system") throw new Error("langflow_internal_authority_required");
	const control = actionControl(ctx.home);
	if (control.identity.hostId !== input.hostId || control.identity.dataHomeId !== input.dataHomeId)
		throw new Error("langflow_bootstrap_identity_changed");
	const authority = createAuthorityPort({ control, archive: control.archive, newTx: ctx.newTx });
	switch (input.operation) {
		case "recoverInitialBinding":
			return authority.recoverInitialBinding(input.input);
		case "revokeOwner":
			return authority.revokeOwner(input.input);
		case "readRevocation":
			return authority.readRevocation(input.input);
		case "readReceipt":
			return authority.readReceipt(input.input);
		case "read":
			return authority.read(input.input);
		case "commit":
			return authority.commit(input.input);
	}
}
