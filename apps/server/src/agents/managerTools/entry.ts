import { createInterface } from "node:readline";
import { createTrellisClient } from "@trellis/api/client";
import { z } from "zod";
import { managerProtocol } from "./managerProtocol";
import { managerReadiness } from "./managerReadiness.ts";
import { managerTools } from "./managerTools";

const env = z
	.object({
		TRELLIS_URL: z.url(),
		TRELLIS_ACTOR: z.string(),
		TRELLIS_AUTH_TOKEN: z.string().optional(),
		TRELLIS_ATTEMPT_TOKEN: z.string(),
		TRELLIS_ATTEMPT_ID: z.string(),
		TRELLIS_MANAGER_TOOLS_READY: z.string().optional(),
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
	const response = handle(line).then(async (result) => {
		if (result === undefined) return;
		await new Promise<void>((resolve, reject) =>
			process.stdout.write(`${JSON.stringify(result)}\n`, (error) => (error ? reject(error) : resolve())),
		);
		if ("result" in result && JSON.parse(line).method === "tools/list" && env.TRELLIS_MANAGER_TOOLS_READY)
			managerReadiness.record(env.TRELLIS_MANAGER_TOOLS_READY, env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN);
	});
	pending.add(response);
	void response.finally(() => pending.delete(response));
}
await Promise.all(pending);
