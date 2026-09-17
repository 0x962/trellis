import { z } from "zod";
import {
	UsageAccountSchema,
	UsageAccountsInputSchema,
	UsageReportInputSchema,
	UsageReportSchema,
} from "../schemas/usage.ts";
import { base } from "./base.ts";

export const usage = {
	report: base
		.route({
			method: "GET",
			path: "/usage",
			summary:
				"Read token usage and API-rate cost from the harness transcripts on this machine, joined to agent runs, tickets, projects, and accounts. The report is cached for five minutes.",
		})
		.input(UsageReportInputSchema)
		.output(UsageReportSchema),
	accounts: base
		.route({
			method: "GET",
			path: "/usage/accounts",
			summary:
				"List every login on this machine with its subscription quota: each configured account and the default login of each harness. Quota is cached for five minutes.",
		})
		.input(UsageAccountsInputSchema)
		.output(z.array(UsageAccountSchema)),
};
