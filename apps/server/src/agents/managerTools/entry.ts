import { createInterface } from "node:readline";
import { z } from "zod";
import { authenticatedManagerTools } from "./authenticatedManagerTools/authenticatedManagerTools.ts";
import { managerProtocol } from "./managerProtocol";
import { managerReadiness } from "./managerReadiness.ts";

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
const tools = authenticatedManagerTools(env);
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
