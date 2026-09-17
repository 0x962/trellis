import { z } from "zod";
import { LoopActionSchema, LoopStatusSchema, LoopWaitSecondsSchema } from "../schemas/loop.ts";
import { base } from "./base.ts";

export const loops = {
	list: base
		.route({ method: "GET", path: "/loops", summary: "Read background loops and their live state" })
		.input(z.strictObject({}))
		.output(z.array(LoopStatusSchema)),
	control: base
		.route({ method: "POST", path: "/loops/{id}/control", summary: "Control a background loop" })
		.input(z.strictObject({ id: z.literal("deterministic-manager"), action: LoopActionSchema }))
		.output(LoopStatusSchema),
	update: base
		.route({ method: "PUT", path: "/loops/{id}", summary: "Update a background loop" })
		.input(z.strictObject({ id: z.literal("deterministic-manager"), waitSeconds: LoopWaitSecondsSchema }))
		.output(LoopStatusSchema),
};
