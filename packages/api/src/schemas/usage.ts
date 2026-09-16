import { z } from "zod";
import { AccountHarnessSchema } from "./harnessAccount.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// The usage report reads the transcript files that each harness CLI writes
// on this machine, prices every turn at the API list rate, and joins each
// session to the Trellis agent run that started it. A session that Trellis
// did not start joins a project through its working directory instead.

export const UsageDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type UsageDays = z.infer<typeof UsageDaysSchema>;

export const UsageMetricSchema = z.enum(["usd", "tokens"]);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

// The seven ways the page slices the report. Every session carries one key
// per grouping, so the client filters the session list by the selected row.
export const UsageGroupBySchema = z.enum(["ticket", "persona", "project", "kind", "account", "model", "harness"]);
export type UsageGroupBy = z.infer<typeof UsageGroupBySchema>;

export const UsageSliceSchema = z.object({ usd: z.number(), tokens: z.number() });
export type UsageSlice = z.infer<typeof UsageSliceSchema>;

export const UsageDaySliceSchema = UsageSliceSchema.extend({ day: z.string() });
export type UsageDaySlice = z.infer<typeof UsageDaySliceSchema>;

// One local calendar day of the range. `harnesses` holds only the harnesses
// with usage that day.
export const UsageDaySchema = UsageDaySliceSchema.extend({
	harnesses: z.partialRecord(AccountHarnessSchema, UsageSliceSchema),
});
export type UsageDay = z.infer<typeof UsageDaySchema>;

// One row of one grouping. `days` is sparse: a day without usage is absent.
// `href` is the web route of the entity, when one exists.
export const UsageGroupRowSchema = z.object({
	key: z.string(),
	label: z.string(),
	detail: z.string().nullable(),
	href: z.string().nullable(),
	harness: AccountHarnessSchema.nullable(),
	usd: z.number(),
	tokens: z.number(),
	sessions: z.number().int(),
	runs: z.number().int(),
	approximate: z.boolean(),
	days: z.array(UsageDaySliceSchema),
});
export type UsageGroupRow = z.infer<typeof UsageGroupRowSchema>;

// One harness session, joined to the agent run that started it when Trellis
// did. `groupKeys` names the row of every grouping the session belongs to.
export const UsageSessionSchema = z.object({
	sessionId: z.string(),
	harness: AccountHarnessSchema,
	model: z.string(),
	label: z.string().nullable(),
	usd: z.number(),
	tokens: z.number(),
	turns: z.number().int(),
	firstAt: IsoDateTimeSchema,
	lastAt: IsoDateTimeSchema,
	approximate: z.boolean(),
	run: z
		.object({
			id: z.string(),
			kind: z.string(),
			persona: z.string(),
			ticketIdentifier: z.string().nullable(),
			ticketTitle: z.string().nullable(),
			projectPath: z.string(),
			account: z.string().nullable(),
		})
		.nullable(),
	groupKeys: z.record(UsageGroupBySchema, z.string()),
});
export type UsageSession = z.infer<typeof UsageSessionSchema>;

export const UsageTotalsSchema = z.object({
	usd: z.number(),
	tokens: z.number(),
	uncachedInput: z.number(),
	cachedInput: z.number(),
	cacheWrite: z.number(),
	output: z.number(),
	reasoningOutput: z.number(),
	cacheSavingsUsd: z.number(),
	// The share of `usd` that a Trellis agent run produced.
	trellisUsd: z.number(),
	sessions: z.number().int(),
	runs: z.number().int(),
	tickets: z.number().int(),
	// True when any turn was priced with a fallback rate.
	approximate: z.boolean(),
});
export type UsageTotals = z.infer<typeof UsageTotalsSchema>;

export const UsageReportSchema = z.object({
	days: UsageDaysSchema,
	buckets: z.array(UsageDaySchema),
	totals: UsageTotalsSchema,
	groups: z.record(UsageGroupBySchema, z.array(UsageGroupRowSchema)),
	sessions: z.array(UsageSessionSchema),
	scannedFiles: z.number().int(),
	pricingTableUpdated: z.string(),
	computedAt: IsoDateTimeSchema,
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

export const UsageReportInputSchema = z.strictObject({
	days: UsageDaysSchema.optional().describe("The range in local calendar days, ending today. Default 30."),
	refresh: z.boolean().optional().describe("Scan the transcripts again instead of the cached report."),
});
export type UsageReportInput = z.infer<typeof UsageReportInputSchema>;

// One login on this machine with its subscription quota: a configured
// account, or the default login of a harness that no account names.
// `key` is the row key of the account grouping in the usage report, so a
// card joins its cost from `groups.account`.
export const UsageAccountSchema = z.object({
	key: z.string(),
	id: UlidSchema.nullable(),
	name: z.string(),
	harness: AccountHarnessSchema,
	profilePath: z.string(),
	isDefault: z.boolean(),
	quota: z.object({
		status: z.enum(["ok", "signed_out", "expired", "unavailable", "unsupported"]),
		email: z.string().nullable(),
		plan: z.string().nullable(),
		detail: z.string().nullable(),
		windows: z.array(
			z.object({ id: z.string(), label: z.string(), usedPercent: z.number(), resetsAt: IsoDateTimeSchema.nullable() }),
		),
		fetchedAt: IsoDateTimeSchema,
	}),
});
export type UsageAccount = z.infer<typeof UsageAccountSchema>;

export const UsageAccountsInputSchema = z.strictObject({
	refresh: z.boolean().optional().describe("Ask the providers again instead of the cached quota."),
});
export type UsageAccountsInput = z.infer<typeof UsageAccountsInputSchema>;
