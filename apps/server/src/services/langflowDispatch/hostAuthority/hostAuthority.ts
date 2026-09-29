import { createAuthorityPort, type AuthorityPort } from "../../../langflowHost";
import type { IoCtx } from "../../support";
import { actionControl } from "../actionControl";

type AuthorityOperation = {
	[K in keyof AuthorityPort]: { operation: K; input: Parameters<AuthorityPort[K]>[0] };
}[keyof AuthorityPort];
export type HostAuthorityInput = AuthorityOperation & { hostId: string; dataHomeId: string };

export async function hostAuthority(ctx: IoCtx, input: HostAuthorityInput) {
	if (ctx.actor.kind !== "system") throw new Error("langflow_internal_authority_required");
	const control = actionControl(ctx.home);
	if (control.identity.hostId !== input.hostId || control.identity.dataHomeId !== input.dataHomeId)
		throw new Error("langflow_bootstrap_identity_changed");
	const authority = createAuthorityPort({ control, archive: control.archive, newTx: ctx.newTx });
	switch (input.operation) {
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
