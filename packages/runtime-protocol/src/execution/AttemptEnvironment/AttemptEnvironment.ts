import { z } from "zod";

// The environment values that identify one attempt to the Trellis server.
// This is the only environment an execution contract carries. The strict
// object refuses every other key, so the master bearer of the server and the
// login environment of the host never enter a contract value. A host adds
// its own login environment and the account profile on its own side.
export const AttemptEnvironmentSchema = z.strictObject({
	TRELLIS_URL: z.string().min(1),
	TRELLIS_ACTOR: z.string().min(1),
	TRELLIS_RUN_ID: z.string().min(1),
	TRELLIS_ATTEMPT_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
	TRELLIS_RUNTIME_HOME: z.string().min(1),
	TRELLIS_ATTEMPT_TOKEN: z.string().min(1),
});
export type AttemptEnvironment = z.infer<typeof AttemptEnvironmentSchema>;
