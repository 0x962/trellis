import { beforeEach, expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { sessionComposerActions, useSessionComposerStore } from "./sessionComposerStore";

beforeEach(() => {
	useSessionComposerStore.setState({
		project: "OP",
		open: false,
		harness: HarnessSchema.parse({ preset: "claude" }),
		accountId: "",
		accountSelection: "automatic",
	});
});

test("a global session starts with no project", () => {
	sessionComposerActions.open();
	expect(useSessionComposerStore.getState()).toMatchObject({ project: "", open: true });
});

test("a project session starts with the selected project", () => {
	sessionComposerActions.open("TRL");
	expect(useSessionComposerStore.getState()).toMatchObject({ project: "TRL", open: true });
});

test("a completed session does not retain its project", () => {
	sessionComposerActions.clear();
	expect(useSessionComposerStore.getState()).toMatchObject({ project: "", open: false });
});

test("quota arrival changes the automatic account and request identity once", () => {
	const original = useSessionComposerStore.getState().requestId;
	sessionComposerActions.automaticAccount("available");
	const selected = useSessionComposerStore.getState();
	expect(selected.accountId).toBe("available");
	expect(selected.requestId).not.toBe(original);
	sessionComposerActions.automaticAccount("available");
	expect(useSessionComposerStore.getState().requestId).toBe(selected.requestId);
});

test("quota refresh preserves an explicit account and the default option", () => {
	for (const accountId of ["manual", ""]) {
		sessionComposerActions.selectAccount(accountId);
		const requestId = useSessionComposerStore.getState().requestId;
		sessionComposerActions.automaticAccount("available");
		expect(useSessionComposerStore.getState()).toMatchObject({ accountId, requestId, accountSelection: "manual" });
	}
});

test("a harness change restores automatic selection", () => {
	sessionComposerActions.selectAccount("claude-account");
	sessionComposerActions.selectHarness(HarnessSchema.parse({ preset: "codex" }));
	expect(useSessionComposerStore.getState()).toMatchObject({ accountId: "", accountSelection: "automatic" });
	sessionComposerActions.automaticAccount("codex-account");
	expect(useSessionComposerStore.getState().accountId).toBe("codex-account");
});

test("model and effort changes retain the manual account", () => {
	sessionComposerActions.selectAccount("manual");
	sessionComposerActions.selectHarness(HarnessSchema.parse({ preset: "claude", model: "anthropic/claude-sonnet-5" }));
	sessionComposerActions.selectHarness({ ...useSessionComposerStore.getState().harness, effort: "medium" });
	sessionComposerActions.automaticAccount("available");
	expect(useSessionComposerStore.getState()).toMatchObject({ accountId: "manual", accountSelection: "manual" });
});

test("close and reopen retain a choice but successful creation restores automatic selection", () => {
	sessionComposerActions.selectAccount("manual");
	sessionComposerActions.close();
	sessionComposerActions.open();
	expect(useSessionComposerStore.getState()).toMatchObject({ accountId: "manual", accountSelection: "manual" });
	sessionComposerActions.clear();
	expect(useSessionComposerStore.getState()).toMatchObject({ accountId: "", accountSelection: "automatic" });
});
