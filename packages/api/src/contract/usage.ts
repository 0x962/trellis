import { z } from "zod";
import {
	UsageAccountSchema,
	UsageAccountsInputSchema,
	UsageRankingInputSchema,
	UsageRankingSchema,
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
				"Read token usage and API-rate cost from the harness transcripts on this machine, joined to agent runs, tickets, projects, and accounts. The report is cached for five minutes. Read usage/ranking for complete ranked pages.",
		})
		.input(UsageReportInputSchema)
		.output(UsageReportSchema),
	ranking: base
		.route({
			method: "GET",
			path: "/usage/ranking",
			summary: "Read a page of ranked groups and matching sessions from one Usage report.",
		})
		.input(UsageRankingInputSchema)
		.output(UsageRankingSchema),
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
