import type { ExecutionTarget } from "../ExecutionTarget";
import type { HostBinding } from "../HostBinding";
import { TargetMismatch } from "../TargetMismatch";

// Every operation of an execution host that takes a target calls this first,
// before any socket or file system work.
export function assertTarget(binding: HostBinding, target: ExecutionTarget): void {
	if (
		target.hostId === binding.hostId &&
		target.controlId === binding.controlId &&
		target.controllerOwnerEpoch === binding.controllerOwnerEpoch
	)
		return;
	throw new TargetMismatch(binding, {
		hostId: target.hostId,
		controlId: target.controlId,
		controllerOwnerEpoch: target.controllerOwnerEpoch,
	});
}
