import { z } from "zod";
import { UlidSchema } from "../primitives.ts";
import { WaveCreateInputSchema } from "../wave.ts";

export const WaveCreateWithTicketsInputSchema = WaveCreateInputSchema.extend({
	tickets: z.array(UlidSchema).refine((ids) => new Set(ids).size === ids.length, "Select each ticket once."),
});
export type WaveCreateWithTicketsInput = z.input<typeof WaveCreateWithTicketsInputSchema>;
