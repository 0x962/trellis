import { UsageReportInputSchema, UsageReportSchema } from "../schemas/usage.ts";
import { base } from "./base.ts";

export const usage = {
	report: base
		.route({
			method: "GET",
			path: "/usage",
			summary:
				"Read token usage and API-rate cost from the harness transcripts on this machine, joined to agent runs, tickets, personas, projects, and accounts. The report is cached for five minutes.",
		})
		.input(UsageReportInputSchema)
		.output(UsageReportSchema),
};
