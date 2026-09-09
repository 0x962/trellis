import { z } from "zod";
import { ActorSchema, DefaultActorSchema } from "../schemas/actor.ts";
import { base } from "./base.ts";

export const actors = {
	list: base
		.route({ method: "GET", path: "/actors", summary: "List every actor seen so far" })
		.output(z.array(ActorSchema)),
	default: base
		.route({ method: "GET", path: "/actors/default", summary: "Read the identity the web app starts with" })
		.output(DefaultActorSchema),
};
