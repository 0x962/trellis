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
	displayName: z.string().min(1).optional(),
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
// `stored` is true when the settings hold the name, so a person chose it.
// A false `stored` means the name is the operating-system user, a
// suggestion for the setup form.
export const DefaultActorSchema = z.object({
	name: ActorNameSchema,
	kind: ActorKindSchema,
	stored: z.boolean().default(false),
});
export type DefaultActor = z.infer<typeof DefaultActorSchema>;
