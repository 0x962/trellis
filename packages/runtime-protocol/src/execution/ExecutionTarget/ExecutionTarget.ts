import { z } from "zod";

// One attempt of one run on one host, under one controller. Every operation
// on an execution host names its target with this record, and the host
// refuses a target whose host or controller fields differ from its binding.
//
// `hostId` and `controlId` are ULID text from the hosts registry.
// `controllerOwnerEpoch` starts at 1 and rises each time a new controller
// takes the control row. `attemptId` is the runtime session id, so it follows
// the session id rule of the runtime. `generation` is the generation of the
// attempt inside its run and starts at 1.
export const ExecutionTargetSchema = z.object({
	controlId: z.string().min(1),
	controllerOwnerEpoch: z.number().int().positive(),
	hostId: z.string().min(1),
	runId: z.string().min(1),
	attemptId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
	generation: z.number().int().positive(),
});
export type ExecutionTarget = z.infer<typeof ExecutionTargetSchema>;
