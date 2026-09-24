import {
	effortForHarness,
	HARNESS_DEFAULT_MODELS,
	type Harness,
	type HarnessAccount,
	type HarnessEffort,
	HarnessSchema,
	MODEL_CATALOG,
	supportsModel,
} from "@trellis/api";
import { harnessLabel, type NativePreset } from "../../../../harnessPresets";

// One agent choice: the four values `agentRuns.start` takes. A null model
// means the default model of the harness, a null effort means the harness
// picks its own level, and a null account means the default account of the
// harness. The store of the recent choices holds this record, so each field
// must survive `JSON.stringify`.
export type AssignChoice = {
	preset: NativePreset;
	model: string | null;
	effort: HarnessEffort | null;
	accountId: string | null;
};

// The accounts of this machine, or undefined while the list is still on its
// way from the server. Undefined and an empty list are different facts: an
// empty list means the harness has no account here, and undefined means
// nobody knows yet.
export type AssignAccounts = readonly HarnessAccount[] | undefined;

// The choice the Assign button takes when the store holds none.
export const DEFAULT_CHOICE: AssignChoice = { preset: "claude", model: null, effort: null, accountId: null };

// Two choices are the same choice when all four values match. The store
// keeps one entry per key.
export const keyOf = (choice: AssignChoice) =>
	[choice.preset, choice.model ?? "", choice.effort ?? "", choice.accountId ?? ""].join("|");

export const modelIdOf = (choice: AssignChoice) => choice.model ?? HARNESS_DEFAULT_MODELS[choice.preset];

// The catalog holds about 100 models. This map answers one name without a
// walk over all of them, and the menu asks once per row on every draw.
const modelNames = new Map(MODEL_CATALOG.map((model) => [model.id, model.name]));

// The name of the model of the choice. A model that left the catalog has no
// name left, so the line prints its ID.
export const modelNameOf = (choice: AssignChoice) => {
	const id = modelIdOf(choice);
	return modelNames.get(id) ?? id;
};

const effortOptionsOf = (choice: AssignChoice) => effortForHarness(choice.preset, modelIdOf(choice));

const offersEffort = (choice: AssignChoice) =>
	effortOptionsOf(choice)?.options.some((option) => option.value === choice.effort) === true;

const liveAccount = (choice: AssignChoice, accounts: AssignAccounts) =>
	accounts?.find((account) => account.id === choice.accountId && account.harness === choice.preset);

// The effort of the choice in words, or null where the harness offers no
// effort control for this model. Muse offers none at any model, and every
// surface then prints nothing about the effort.
export const effortTextOf = (choice: AssignChoice) => {
	const effort = effortOptionsOf(choice);
	if (!effort) return null;
	if (choice.effort === null) return "Harness default";
	return effort.options.find((option) => option.value === choice.effort)?.label ?? null;
};

// The name of the account, or null when no name is known: the account list
// has not arrived, or it no longer holds this account. `staleReasonOf`
// reports the missing account, so no caller prints a made-up name.
export const accountTextOf = (choice: AssignChoice, accounts: AssignAccounts) => {
	if (choice.accountId === null) return "Default account";
	if (accounts === undefined) return null;
	return liveAccount(choice, accounts)?.name ?? null;
};

// The second line of a menu row: the effort and the account.
export const detailOf = (choice: AssignChoice, accounts: AssignAccounts) =>
	[effortTextOf(choice), accountTextOf(choice, accounts)].filter((part) => part !== null).join(" · ");

// The whole choice in one line, for the tooltip of the Assign button, which
// names the harness alone.
export const titleOf = (choice: AssignChoice, accounts: AssignAccounts) =>
	[harnessLabel(choice.preset), modelNameOf(choice), detailOf(choice, accounts)]
		.filter((part) => part !== "")
		.join(" · ");

// Why a stored choice cannot start as it stands, or null when it can start.
//
// Trellis never swaps a missing value for another one on its own. The control
// opens the dialog with the missing value removed, and the person picks
// again. So an agent only starts on values the person picked.
//
// An account is judged only against a list that arrived. While the list
// loads, the choice stays as the person stored it.
export const staleReasonOf = (choice: AssignChoice, accounts: AssignAccounts) => {
	if (choice.model !== null && !modelNames.has(choice.model)) return "This model is gone. Opens the setting.";
	if (choice.model !== null && !supportsModel(choice.preset, choice.model))
		return `${harnessLabel(choice.preset)} does not serve this model. Opens the setting.`;
	if (choice.effort !== null && !offersEffort(choice)) return "This effort level is gone. Opens the setting.";
	if (choice.accountId !== null && accounts !== undefined && liveAccount(choice, accounts) === undefined)
		return "This account is gone. Opens the setting.";
	return null;
};

// The choice without each value the machine no longer holds: a model the
// harness dropped, an effort that is gone, an account that is gone. The
// dialog opens on the result, so the person sees what will run and confirms
// it with Assign.
export const withoutLostValues = (choice: AssignChoice, accounts: AssignAccounts): AssignChoice => {
	const model = choice.model !== null && supportsModel(choice.preset, choice.model) ? choice.model : null;
	const kept: AssignChoice = { ...choice, model };
	return {
		preset: choice.preset,
		model,
		effort: offersEffort(kept) ? choice.effort : null,
		accountId:
			choice.accountId === null || accounts === undefined || liveAccount(choice, accounts) !== undefined
				? choice.accountId
				: null,
	};
};

// The harness record `agentRuns.start` takes. Put the model in this record
// and not in the separate `model` field of the start input. The server clears
// the effort when it reads that field.
export const harnessOf = (choice: AssignChoice): Harness =>
	HarnessSchema.parse({
		preset: choice.preset,
		...(choice.model === null ? {} : { model: choice.model }),
		...(choice.effort === null ? {} : { effort: choice.effort }),
	});
