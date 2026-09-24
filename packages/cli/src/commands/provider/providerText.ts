import type { Provider, ProviderCreateInput, ProviderKind, ProviderUpdateInput } from "@trellis/api";
import { shortZonedDateTime } from "@trellis/api/time";
import { type CliContext, compact, readText } from "../../context.ts";
import { usageError } from "../../errors.ts";
import { hasFlag, repeatedFlag } from "../../flags.ts";
import { cell, type ListSpec, type RecordSpec } from "../../output.ts";

type CreateArgs = {
	name: string;
	kind: string;
	"base-url"?: string;
	"api-key": string;
	disabled?: boolean;
};

type EditArgs = {
	id: string;
	name?: string;
	"base-url"?: string;
	"api-key"?: string;
	enabled?: string;
};

const readApiKey = async (ctx: CliContext, value: string) => {
	if (value !== "-") throw usageError("--api-key takes - and reads the key from standard input.");
	return (await readText(ctx, value)).trim();
};

const enabledValue = (value: string | undefined): boolean | undefined => {
	if (value === undefined) return undefined;
	if (value === "true") return true;
	if (value === "false") return false;
	throw usageError('--enabled takes "true" or "false".');
};

export const providerCreateInput = async (
	ctx: CliContext,
	rawArgs: string[],
	args: CreateArgs,
): Promise<ProviderCreateInput> => {
	const models = repeatedFlag(rawArgs, "model");
	return compact({
		name: args.name,
		kind: args.kind as ProviderKind,
		baseUrl: args["base-url"],
		apiKey: await readApiKey(ctx, args["api-key"]),
		enabled: args.disabled === true ? false : undefined,
		models: models.length === 0 ? undefined : models,
	});
};

export const providerUpdateInput = async (
	ctx: CliContext,
	rawArgs: string[],
	args: EditArgs,
): Promise<ProviderUpdateInput> => {
	const models = repeatedFlag(rawArgs, "model");
	const noModels = hasFlag(rawArgs, "no-models");
	if (models.length > 0 && noModels) throw usageError("Use --model or --no-models, not both.");
	return compact({
		id: args.id,
		name: args.name,
		baseUrl: args["base-url"],
		apiKey: args["api-key"] === undefined ? undefined : await readApiKey(ctx, args["api-key"]),
		enabled: enabledValue(args.enabled),
		models: noModels ? [] : models.length === 0 ? undefined : models,
	});
};

const keyText = (provider: Provider) => `••••${provider.keyLast4}`;

export const providerList: ListSpec<Provider> = {
	columns: [
		{ name: "id", value: (provider) => provider.id },
		{ name: "name", value: (provider) => provider.name },
		{ name: "kind", value: (provider) => provider.kind },
		{ name: "enabled", value: (provider) => String(provider.enabled) },
		{ name: "models", value: (provider) => String(provider.models.length) },
		{ name: "key", value: keyText },
	],
	identifier: (provider) => provider.id,
};

export const providerRecord: RecordSpec<Provider> = {
	fields: [
		{ name: "id", value: (provider) => provider.id },
		{ name: "name", value: (provider) => provider.name },
		{ name: "kind", value: (provider) => provider.kind },
		{ name: "base url", value: (provider) => provider.baseUrl },
		{ name: "enabled", value: (provider) => String(provider.enabled) },
		{ name: "key", value: keyText },
		{ name: "models", value: (provider) => cell(provider.models.join(", ")) },
		{ name: "created", value: (provider) => shortZonedDateTime(provider.createdAt) },
		{ name: "updated", value: (provider) => shortZonedDateTime(provider.updatedAt) },
	],
	identifier: (provider) => provider.id,
};

export const providerDeletedRecord: RecordSpec<{ id: string }> = {
	fields: [{ name: "deleted", value: (provider) => provider.id }],
	identifier: (provider) => provider.id,
};
