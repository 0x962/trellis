import { expect, test } from "bun:test";
import type { HarnessAccount } from "@trellis/api";
import {
	type AssignChoice,
	accountTextOf,
	detailOf,
	effortTextOf,
	harnessOf,
	keyOf,
	modelIdOf,
	modelNameOf,
	staleReasonOf,
	titleOf,
	withoutLostValues,
} from "./assignChoice";

const choice = (fields: Partial<AssignChoice> = {}): AssignChoice => ({
	preset: "claude",
	model: null,
	effort: null,
	accountId: null,
	...fields,
});

const WORK = "01JAAAAAAAAAAAAAAAAAAAAAAA";
const account = (fields: Partial<HarnessAccount> = {}): HarnessAccount =>
	({ id: WORK, name: "Work", harness: "claude", ...fields }) as HarnessAccount;

test("the key holds all four values", () => {
	expect(keyOf(choice({ effort: "high", accountId: WORK }))).toBe(`claude||high|${WORK}`);
	expect(keyOf(choice())).not.toBe(keyOf(choice({ effort: "high" })));
});

test("a choice with no model reads the default model of its harness", () => {
	expect(modelIdOf(choice())).toBe("anthropic/claude-opus-5");
	expect(modelIdOf(choice({ preset: "codex" }))).toBe("openai/gpt-5.6-sol");
});

test("a model that left the catalog keeps its ID as its name", () => {
	expect(modelNameOf(choice())).toBe("Claude Opus 5");
	expect(modelNameOf(choice({ model: "anthropic/claude-sonnet-5" }))).toBe("Claude Sonnet 5");
	expect(modelNameOf(choice({ model: "anthropic/claude-opus-4.9" }))).toBe("anthropic/claude-opus-4.9");
});

test("a harness with no effort control prints no effort", () => {
	expect(effortTextOf(choice({ preset: "muse" }))).toBeNull();
	expect(effortTextOf(choice())).toBe("Harness default");
	expect(effortTextOf(choice({ effort: "xhigh" }))).toBe("Extra high");
});

test("an account the list has not sent yet prints nothing", () => {
	expect(accountTextOf(choice({ accountId: WORK }), undefined)).toBeNull();
	expect(accountTextOf(choice(), undefined)).toBe("Default account");
	expect(accountTextOf(choice({ accountId: WORK }), [account()])).toBe("Work");
	expect(accountTextOf(choice({ accountId: WORK }), [])).toBeNull();
});

test("the detail line of Muse holds the account alone", () => {
	expect(detailOf(choice({ preset: "muse" }), [])).toBe("Default account");
	expect(detailOf(choice({ effort: "low", accountId: WORK }), [account()])).toBe("Low · Work");
});

test("the title names the harness, the model, the effort and the account", () => {
	expect(titleOf(choice(), [])).toBe("Claude · Claude Opus 5 · Harness default · Default account");
});

test("a model that left the catalog stops the row", () => {
	expect(staleReasonOf(choice({ model: "anthropic/claude-opus-4.9" }), [])).toBe(
		"This model is gone. Opens the setting.",
	);
	expect(staleReasonOf(choice({ model: "openai/gpt-5.6-sol" }), [])).toBe(
		"Claude does not serve this model. Opens the setting.",
	);
	expect(staleReasonOf(choice({ model: "anthropic/claude-sonnet-5" }), [])).toBeNull();
});

test("an effort the model no longer offers stops the row", () => {
	expect(staleReasonOf(choice({ effort: "ultra" }), [])).toBe("This effort level is gone. Opens the setting.");
	expect(staleReasonOf(choice({ effort: "high" }), [])).toBeNull();
	expect(staleReasonOf(choice({ preset: "muse", effort: "high" }), [])).toBe(
		"This effort level is gone. Opens the setting.",
	);
});

test("an account the list no longer holds stops the row, and a loading list does not", () => {
	expect(staleReasonOf(choice({ accountId: WORK }), [])).toBe("This account is gone. Opens the setting.");
	expect(staleReasonOf(choice({ accountId: WORK }), [account({ harness: "codex" })])).toBe(
		"This account is gone. Opens the setting.",
	);
	expect(staleReasonOf(choice({ accountId: WORK }), undefined)).toBeNull();
	expect(staleReasonOf(choice({ accountId: WORK }), [account()])).toBeNull();
});

test("the choice loses the values the machine no longer holds", () => {
	expect(withoutLostValues(choice({ model: "openai/gpt-5.6-sol", effort: "high", accountId: WORK }), [])).toEqual(
		choice({ effort: "high" }),
	);
	expect(withoutLostValues(choice({ effort: "ultra" }), [account()])).toEqual(choice());
});

test("the choice keeps an account while the list loads", () => {
	expect(withoutLostValues(choice({ accountId: WORK }), undefined).accountId).toBe(WORK);
	expect(withoutLostValues(choice({ accountId: WORK }), [account()]).accountId).toBe(WORK);
	expect(withoutLostValues(choice({ accountId: WORK }), []).accountId).toBeNull();
});

test("the start harness carries the model and the effort of the choice", () => {
	const harness = harnessOf(choice({ model: "anthropic/claude-sonnet-5", effort: "low" }));
	expect(harness).toMatchObject({ preset: "claude", model: "anthropic/claude-sonnet-5", effort: "low" });
	expect(harnessOf(choice()).model).toBeUndefined();
});
