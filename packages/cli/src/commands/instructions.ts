import { agentGuide } from "@trellis/api/agent-guide";
import { defineCommand } from "citty";
import { contextOf } from "../context.ts";

export default defineCommand({
	meta: { name: "show", description: "Print the Trellis main guide" },
	args: {
		project: { type: "string", description: "Project key to put in the text" },
	},
	async run(context) {
		contextOf(context).out.write(agentGuide({ "project.key": context.args.project ?? "None" }));
	},
});
