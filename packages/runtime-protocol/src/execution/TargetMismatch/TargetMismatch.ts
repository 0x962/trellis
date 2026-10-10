import type { HostBinding } from "../HostBinding";

// The error an execution host throws when a target names another host or
// another controller. `expected` is the binding of the host, and `actual`
// holds the same three fields of the target.
export class TargetMismatch extends Error {
	readonly code = "EXECUTION_TARGET_MISMATCH";
	constructor(
		readonly expected: HostBinding,
		readonly actual: HostBinding,
	) {
		super(
			`Execution target names host ${actual.hostId}, control ${actual.controlId}, epoch ${actual.controllerOwnerEpoch}; this host serves host ${expected.hostId}, control ${expected.controlId}, epoch ${expected.controllerOwnerEpoch}`,
		);
	}
}
