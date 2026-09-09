import { expect, test } from "bun:test";
import { ActorRefSchema, DefaultActorSchema } from "./actor.ts";

// The poller links pull requests and writes activity rows as `system:trellis`,
// so a stored actor carries that kind. The default actor is the identity the
// web app puts in `x-trellis-actor`, and the header never carries `system`.
test("a stored actor ref accepts the system kind and the default actor does not", () => {
	expect(ActorRefSchema.safeParse({ name: "trellis", kind: "system" }).success).toBe(true);
	expect(ActorRefSchema.safeParse({ name: "navid", kind: "human" }).success).toBe(true);
	expect(ActorRefSchema.safeParse({ name: "navid", kind: "robot" }).success).toBe(false);
	expect(DefaultActorSchema.safeParse({ name: "trellis", kind: "system" }).success).toBe(false);
});
