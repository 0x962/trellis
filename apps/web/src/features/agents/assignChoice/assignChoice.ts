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
import { harnessLabel, type NativePreset } from "../harnessPresets";

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
export const choiceKey = (choice: AssignChoice) =>
	[choice.preset, choice.model ?? "", choice.effort ?? "", choice.accountId ?? ""].join("|");

export const modelIdOf = (choice: AssignChoice) => choice.model ?? HARNESS_DEFAULT_MODELS[choice.preset];

const modelNameOf = (id: string) => MODEL_CATALOG.find((model) => model.id === id)?.name ?? null;

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

// The account of the choice in words, or null where no word is true yet: the
// list is still loading, or it no longer holds the account. `staleReasonOf`
// names the account that is gone, so no line has to invent one.
export const accountTextOf = (choice: AssignChoice, accounts: AssignAccounts) => {
	if (choice.accountId === null) return "Default account";
	if (accounts === undefined) return null;
	return liveAccount(choice, accounts)?.name ?? null;
};

// The second line of a menu row: the effort and the account.
export const choiceDetail = (choice: AssignChoice, accounts: AssignAccounts) =>
	[effortTextOf(choice), accountTextOf(choice, accounts)].filter((part) => part !== null).join(" · ");

// The whole choice in one line, for the tooltip of the Assign button, which
// names the harness alone.
export const choiceTitle = (choice: AssignChoice, accounts: AssignAccounts) => {
	const modelId = modelIdOf(choice);
	return [harnessLabel(choice.preset), modelNameOf(modelId) ?? modelId, choiceDetail(choice, accounts)]
		.filter((part) => part !== "")
		.join(" · ");
};

// Why a stored choice cannot start as it stands, or null when it can start.
// A stored value that the machine no longer holds is never replaced behind
// the person: the control opens the dialog with that value dropped, and the
// person chooses again. So an agent never starts on a model, an effort or an
// account that the person did not pick.
//
// An account is judged only against a list that arrived. While the list
// loads, the choice stays as the person stored it.
export const staleReasonOf = (choice: AssignChoice, accounts: AssignAccounts) => {
	if (choice.model !== null && modelNameOf(choice.model) === null) return "This model is gone. Opens the setting.";
	if (choice.model !== null && !supportsModel(choice.preset, choice.model))
		return `${harnessLabel(choice.preset)} does not serve this model. Opens the setting.`;
	if (choice.effort !== null && !offersEffort(choice)) return "This effort level is gone. Opens the setting.";
	if (choice.accountId !== null && accounts !== undefined && liveAccount(choice, accounts) === undefined)
		return "This account is gone. Opens the setting.";
	return null;
};

// The choice the dialog opens on, for a stored choice that cannot start. It
// keeps every value the machine still holds and drops the rest, so the
// dialog shows what will run and the person confirms it with Assign.
export const draftFrom = (choice: AssignChoice, accounts: AssignAccounts): AssignChoice => {
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

// The harness record `agentRuns.start` takes. The model travels inside it,
// so the effort of the choice survives: the server clears the effort when it
// reads a model from the separate `model` field of the start input.
export const harnessOf = (choice: AssignChoice): Harness =>
	HarnessSchema.parse({
		preset: choice.preset,
		...(choice.model === null ? {} : { model: choice.model }),
		...(choice.effort === null ? {} : { effort: choice.effort }),
	});
