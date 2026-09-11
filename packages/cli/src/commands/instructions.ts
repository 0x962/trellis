import { rolePrompt } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../client.ts";
import { contextOf } from "../context.ts";
import { usageError } from "../errors.ts";
import template from "../instructions.md" with { type: "text" };

// Without --role the verb prints the AGENTS.md block. The md file carries
// the literal placeholder KEY; instructions.test.ts proves it renders the
// same block as `instructions()` in @trellis/api.
//
// With --role it prints the prompt an agent of that role starts with. The
// launch command from `agentLaunch` runs this verb, so its output is the
// prompt claude gets. A manager prompt holds the status descriptions of the
// project, so --role manager with --project reads them from the server.
export default defineCommand({
	meta: { name: "instructions", description: "Print the AGENTS.md block or the prompt of an agent role" },
	args: {
		project: { type: "string", description: "Project key to put in the text" },
		role: { type: "enum", options: ["manager", "builder", "reviewer"], description: "Agent role" },
		ticket: { type: "string", description: "Ticket of a builder or a reviewer" },
		pr: { type: "string", description: "Pull request URL of a reviewer" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { role, ticket, pr } = context.args;
		const project = context.args.project ?? "KEY";
		if (role === undefined) {
			if (ticket !== undefined || pr !== undefined) throw usageError("--ticket and --pr need --role");
			ctx.out.write(template.replaceAll("KEY", project));
			return;
		}
		if (role === "manager") {
			const statuses =
				context.args.project === undefined ? null : (await clientOf(ctx).statuses.list({ project })).statuses;
			ctx.out.write(rolePrompt({ role, project, statuses }));
			return;
		}
		if (role === "builder") {
			if (ticket === undefined) throw usageError("--role builder needs --ticket");
			ctx.out.write(rolePrompt({ role, project, ticket }));
			return;
		}
		if (ticket === undefined || pr === undefined) throw usageError("--role reviewer needs --ticket and --pr");
		ctx.out.write(rolePrompt({ role, project, ticket, prUrl: pr }));
	},
});
