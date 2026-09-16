import { createTrellisClient } from "@trellis/api/client";
import { z } from "zod";
import { managerTools } from "../managerTools.ts";

export function authenticatedManagerTools(environment: NodeJS.ProcessEnv) {
	const env = z
		.object({
			TRELLIS_URL: z.url(),
			TRELLIS_ACTOR: z.string(),
			TRELLIS_AUTH_TOKEN: z.string().optional(),
			TRELLIS_ATTEMPT_TOKEN: z.string(),
		})
		.parse(environment);
	const client = createTrellisClient(env.TRELLIS_URL, env.TRELLIS_ACTOR, (request, init) => {
		if (env.TRELLIS_AUTH_TOKEN) request.headers.set("authorization", `Bearer ${env.TRELLIS_AUTH_TOKEN}`);
		request.headers.set("x-trellis-attempt", env.TRELLIS_ATTEMPT_TOKEN);
		return fetch(request, init);
	}) as unknown as Record<string, Record<string, (input: unknown) => Promise<unknown>>>;
	return managerTools((operation, input) => {
		const [group, action] = operation.split(".") as [string, string];
		return client[group]![action]!(input);
	});
}
