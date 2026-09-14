import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { json } from "../output.ts";

export default defineCommand({
	meta: { name: "doctor", description: "Inspect the local host, execution service, and manager queue" },
	async run(context) {
		const ctx = contextOf(context);
		ctx.out.write(json(await clientOf(ctx).system.doctor({})));
	},
});
