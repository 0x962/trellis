import { beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useComposerDraft } from "./useComposerDraft";

const key = "trellis-composer-draft";

beforeEach(() => sessionStorage.clear());

describe("features/composer/hooks/useComposerDraft", () => {
	// Outcome 98. A close unmounts the dialog; a reopen mounts a new one.
	test("keeps the draft in sessionStorage across a close and reopen", () => {
		const first = renderHook(() => useComposerDraft());
		act(() => first.result.current.setDraft({ title: "Fix the auth flow", description: "## Goal\n\nRefresh first." }));
		expect(sessionStorage.getItem(key)).toContain("Fix the auth flow");
		first.unmount();
		const second = renderHook(() => useComposerDraft());
		expect(second.result.current.draft.title).toBe("Fix the auth flow");
		expect(second.result.current.draft.description).toBe("## Goal\n\nRefresh first.");
	});

	// Outcome 99
	test("clears the draft after a successful create", () => {
		const { result } = renderHook(() => useComposerDraft());
		act(() => result.current.setDraft({ title: "Gone soon", description: "Body" }));
		expect(sessionStorage.getItem(key)).not.toBeNull();
		act(() => result.current.clearDraft());
		expect(sessionStorage.getItem(key)).toBeNull();
		expect(result.current.draft.title).toBe("");
		expect(result.current.draft.description).toBe("");
	});
});
