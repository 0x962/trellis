import { z } from "zod";
import { ActorKindSchema, StoredActorKindSchema } from "./enums.ts";
import { IsoDateTimeSchema } from "./primitives.ts";

const ActorNameSchema = z.string().min(1).max(64);

// Only a name and a kind are stored about a person or an agent. The poller
// and the internal batches act as `system:trellis`, so a stored ref carries
// that kind too.
export const ActorRefSchema = z.object({
	name: ActorNameSchema,
	kind: StoredActorKindSchema,
});
export type ActorRef = z.infer<typeof ActorRefSchema>;

export const ActorSchema = ActorRefSchema.extend({
	firstSeenAt: IsoDateTimeSchema,
	lastSeenAt: IsoDateTimeSchema,
});
export type Actor = z.infer<typeof ActorSchema>;

// The identity the web app starts with: `git config user.name` on the server
// machine, else the OS user name. It goes into `x-trellis-actor`, which
// takes only the client kinds.
export const DefaultActorSchema = z.object({
	name: ActorNameSchema,
	kind: ActorKindSchema,
});
export type DefaultActor = z.infer<typeof DefaultActorSchema>;
