import { z } from "zod";

export const NativeFixturePlanSchema = z.strictObject({
	schemaVersion: z.literal(1),
	requestTimeoutMs: z.number().int().positive(),
	denialPorts: z.strictObject({ ipv4: z.number().int().min(1).max(65535), ipv6: z.number().int().min(1).max(65535) }),
	turns: z
		.array(
			z.strictObject({
				marker: z.string().min(1),
				mode: z.enum(["complete", "hold"]),
				result: z.string(),
			}),
		)
		.min(1),
});

export type NativeFixturePlan = z.infer<typeof NativeFixturePlanSchema>;
