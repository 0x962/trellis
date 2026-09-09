import { z } from "zod";
import { ActorKindSchema } from "./enums.ts";
import { IsoDateTimeSchema } from "./primitives.ts";

// Only a name and a kind are stored about a person or an agent.
export const ActorRefSchema = z.object({
	name: z.string().min(1).max(64),
	kind: ActorKindSchema,
});
export type ActorRef = z.infer<typeof ActorRefSchema>;

export const ActorSchema = ActorRefSchema.extend({
	firstSeenAt: IsoDateTimeSchema,
	lastSeenAt: IsoDateTimeSchema,
});
export type Actor = z.infer<typeof ActorSchema>;

// The identity the web app starts with: `git config user.name` on the server
// machine, else the OS user name.
export const DefaultActorSchema = ActorRefSchema;
export type DefaultActor = z.infer<typeof DefaultActorSchema>;
