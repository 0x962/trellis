import { createInterface } from "node:readline";
import { createTrellisClient } from "@trellis/api/client";
import { z } from "zod";
import { managerProtocol } from "./managerProtocol";
import { managerTools } from "./managerTools";

const env = z
	.object({
		TRELLIS_URL: z.url(),
		TRELLIS_ACTOR: z.string(),
		TRELLIS_AUTH_TOKEN: z.string().optional(),
		TRELLIS_ATTEMPT_TOKEN: z.string(),
	})
	.parse(process.env);
const client = createTrellisClient(env.TRELLIS_URL, env.TRELLIS_ACTOR, (request, init) => {
	if (env.TRELLIS_AUTH_TOKEN) request.headers.set("authorization", `Bearer ${env.TRELLIS_AUTH_TOKEN}`);
	request.headers.set("x-trellis-attempt", env.TRELLIS_ATTEMPT_TOKEN);
	return fetch(request, init);
}) as unknown as Record<string, Record<string, (input: unknown) => Promise<unknown>>>;
const tools = managerTools((operation, input) => {
	const [group, action] = operation.split(".") as [string, string];
	return client[group]![action]!(input);
});
const handle = managerProtocol(tools);
const pending = new Set<Promise<void>>();
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
	const response = handle(line).then((result) => {
		if (result !== undefined) process.stdout.write(`${JSON.stringify(result)}\n`);
	});
	pending.add(response);
	void response.finally(() => pending.delete(response));
}
await Promise.all(pending);
