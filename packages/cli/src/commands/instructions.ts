import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import template from "../instructions.md" with { type: "text" };

// The md file carries the literal placeholder KEY. instructions.test.ts
// proves it renders the same block as `instructions()` in @trellis/api.
export default defineCommand({
	meta: { name: "instructions", description: "Print the AGENTS.md block" },
	args: { project: { type: "string", description: "Project key to put in the examples" } },
	run(context) {
		const ctx = contextOf(context);
		ctx.out.write(template.replaceAll("KEY", context.args.project ?? "KEY"));
	},
});
