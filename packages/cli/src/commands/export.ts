import { defineCommand } from "citty";
import { clientOptions, trellisFetch } from "../client.ts";
import { contextOf } from "../context.ts";

// The NDJSON body goes to stdout as it arrives; no format flag changes it.
export default defineCommand({
	meta: { name: "export", description: "Stream every table as NDJSON" },
	async run(context) {
		const ctx = contextOf(context);
		const fetch = trellisFetch(clientOptions(ctx));
		const response = await fetch(new Request(`${ctx.url}/api/export`), {});
		const decoder = new TextDecoder();
		for await (const chunk of response.body!) ctx.out.write(decoder.decode(chunk, { stream: true }));
	},
});
