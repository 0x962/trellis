import { type EpicAutopilot, EpicAutopilotSchema, HarnessSchema } from "@trellis/api";
import { defineCommand } from "citty";
import { clientOf } from "../../../client.ts";
import { contextOf } from "../../../context.ts";
import { json, printRecord, type RecordSpec } from "../../../output.ts";

const epicArg = { type: "positional" as const, required: true as const, description: "Epic ref" };
const record: RecordSpec<EpicAutopilot> = {
	fields: [
		{ name: "state", value: (value) => (value.enabled ? "on" : "off") },
		{ name: "max concurrency", value: (value) => String(value.maxConcurrency) },
		{ name: "harness", value: (value) => value.harness.preset },
		{ name: "model", value: (value) => value.harness.model ?? "default" },
		{ name: "account", value: (value) => value.accountId ?? "default" },
	],
	identifier: (value) => (value.enabled ? "on" : "off"),
};

const show = defineCommand({
	meta: { name: "show", description: "Read epic autopilot settings" },
	args: { epic: epicArg },
	async run(context) {
		const ctx = contextOf(context);
		const autopilot = await clientOf(ctx).epics.autopilot({ epic: context.args.epic });
		if (autopilot === null)
			ctx.out.write(["json", "jsonl"].includes(ctx.format.mode) ? json(null) : "Autopilot is off.\n");
		else printRecord(ctx.out, ctx.format, autopilot, record);
	},
});

const enable = defineCommand({
	meta: { name: "enable", description: "Start ready tickets automatically within an epic" },
	args: {
		epic: epicArg,
		"max-concurrency": { type: "string", required: true, description: "Maximum assigned tickets before review" },
		harness: { type: "string", required: true, description: "Harness preset" },
		model: { type: "string", description: "Canonical model ID" },
		effort: { type: "string", description: "Reasoning effort" },
		account: { type: "string", description: "Account ID for the selected harness" },
	},
	async run(context) {
		const ctx = contextOf(context);
		const { args } = context;
		const autopilot = EpicAutopilotSchema.parse({
			enabled: true,
			maxConcurrency: Number(args["max-concurrency"]),
			harness: HarnessSchema.parse({ preset: args.harness, model: args.model, effort: args.effort }),
			accountId: args.account ?? null,
		});
		const saved = await clientOf(ctx).epics.setAutopilot({ epic: args.epic, autopilot });
		printRecord(ctx.out, ctx.format, saved, record);
	},
});

const disable = defineCommand({
	meta: { name: "disable", description: "Stop new automatic assignments and keep existing agents" },
	args: { epic: epicArg },
	async run(context) {
		const ctx = contextOf(context);
		const client = clientOf(ctx);
		const epic = context.args.epic;
		const autopilot = await client.epics.autopilot({ epic });
		if (autopilot === null)
			ctx.out.write(["json", "jsonl"].includes(ctx.format.mode) ? json(null) : "Autopilot is off.\n");
		else {
			const saved = await client.epics.setAutopilot({ epic, autopilot: { ...autopilot, enabled: false } });
			printRecord(ctx.out, ctx.format, saved, record);
		}
	},
});

export const autopilot = defineCommand({
	meta: { name: "autopilot", description: "Control automatic ticket starts for an epic" },
	subCommands: { show, enable, disable },
});
