import type { ProviderCheck, ProviderModelEntry, ProviderModels } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import type { CliContext } from "../../context.ts";
import { cell, json, type ListSpec, printList, printRecord, type RecordSpec } from "../../output.ts";

const modelList: ListSpec<ProviderModelEntry> = {
	columns: [
		{ name: "id", value: (model) => model.id },
		{ name: "name", value: (model) => cell(model.name) },
		{ name: "type", value: (model) => model.type },
	],
	identifier: (model) => model.id,
};

export const printProviderModels = (ctx: CliContext, result: ProviderModels, all: boolean): number => {
	if (ctx.format.mode === "json" || ctx.format.mode === "jsonl") ctx.out.write(json(result));
	if (!result.ok) {
		ctx.err.write(`error: ${result.detail}\n`);
		return 1;
	}
	if (ctx.format.mode === "json" || ctx.format.mode === "jsonl") return 0;
	printList(ctx.out, ctx.format, all ? result.models : result.models.slice(0, 50), modelList);
	if (ctx.format.mode === "table" && !all && result.models.length > 50)
		ctx.out.write(`... ${result.models.length - 50} more; add --all\n`);
	return 0;
};

export const printProviderCheck = (ctx: CliContext, id: string, name: string, result: ProviderCheck): void => {
	const spec: RecordSpec<ProviderCheck> = {
		fields: [
			{ name: "provider", value: () => name },
			{ name: "ok", value: (check) => String(check.ok) },
			{ name: "balance", value: (check) => cell(check.balance) },
			{ name: "detail", value: (check) => cell(check.detail) },
			{ name: "checked", value: (check) => shortZonedDateTime(check.checkedAt) },
		],
		identifier: () => id,
	};
	printRecord(ctx.out, ctx.format, result, spec);
};
