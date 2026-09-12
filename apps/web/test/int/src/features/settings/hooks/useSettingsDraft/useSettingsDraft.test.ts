import { beforeEach, describe, expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import { useSettingsDraft } from "../../../../../../../src/features/settings/hooks/useSettingsDraft/useSettingsDraft";
import { interceptFetch } from "../../../../../../interceptFetch";
import { mockMatchMedia } from "../../../../../../media";
import { renderHookWithProviders } from "../../../../../../renderHook";
import { createTestServer } from "../../../../../../server";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

describe("useSettingsDraft", () => {
	// The name field saves on blur, and a person types the next field while
	// that save runs. The save that returns keeps every edit it did not carry.
	test("a save keeps the edits made while it was in flight", async () => {
		const held = interceptFetch(createTestServer(), { match: (text) => text.includes("settings/set") });
		const view = renderHookWithProviders(() => useSettingsDraft(), undefined, {
			path: "/settings",
			actor: "dana",
			server: held.server,
		});
		await waitFor(() => expect(view.result.current.saved).toBeDefined());

		act(() => void view.result.current.edit({ defaultActorName: "Nav" }));
		let saving: Promise<unknown> = Promise.resolve();
		act(() => {
			saving = view.result.current.save({ defaultActorName: "Nav" });
		});
		await waitFor(() => expect(held.held()).toBe(1));
		act(() => void view.result.current.edit({ diffUrlTemplate: "http://diff.localhost/{url}" }));
		await act(async () => {
			held.release();
			await saving;
		});

		expect(view.result.current.saved?.defaultActorName).toBe("Nav");
		expect(view.result.current.draft.defaultActorName).toBeUndefined();
		expect(view.result.current.draft.diffUrlTemplate).toBe("http://diff.localhost/{url}");

		let second: Promise<unknown> = Promise.resolve();
		act(() => {
			second = view.result.current.save({});
		});
		await waitFor(() => expect(held.held()).toBe(1));
		await act(async () => {
			held.release();
			await second;
		});
		expect(view.result.current.saved?.diffUrlTemplate).toBe("http://diff.localhost/{url}");
		expect(view.result.current.draft).toEqual({});
	});
});
