import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import template from "../instructions.md" with { type: "text" };

export default defineCommand({
	meta: { name: "instructions", description: "Print the AGENTS.md block" },
	args: {
		project: { type: "string", description: "Project key to put in the text" },
	},
	async run(context) {
		contextOf(context).out.write(template.replaceAll("KEY", context.args.project ?? "KEY"));
	},
});
