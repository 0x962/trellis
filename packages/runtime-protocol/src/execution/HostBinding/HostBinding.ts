import type { z } from "zod";
import { ExecutionTargetSchema } from "../ExecutionTarget";

// The identity one execution host instance serves. The host accepts a target
// only when these three fields of the target equal the binding.
export const HostBindingSchema = ExecutionTargetSchema.pick({
	controlId: true,
	controllerOwnerEpoch: true,
	hostId: true,
});
export type HostBinding = z.infer<typeof HostBindingSchema>;
