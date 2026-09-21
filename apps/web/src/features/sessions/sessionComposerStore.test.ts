import { beforeEach, expect, test } from "bun:test";
import { sessionComposerActions, useSessionComposerStore } from "./sessionComposerStore";

beforeEach(() => {
	useSessionComposerStore.setState({ project: "OP", open: false });
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
