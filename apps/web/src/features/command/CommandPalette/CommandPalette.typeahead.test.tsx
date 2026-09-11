import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { paletteInput, press, renderShell, resetStores } from "../../../../test/palette";
import { findGrid } from "../../../../test/table";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	resetStores();
});

describe("features/command/CommandPalette: keys typed at once", () => {
	// The dialog is a lazy chunk, and its field takes the focus some frames
	// after Cmd+K. The keys typed in that time belong to the query. A page
	// hotkey such as `o` must not act on them.
	test("keys typed right after Cmd+K fill the query and move no page", async () => {
		const { router } = await renderShell({ path: "/p/CDE/table" });
		await findGrid();
		press("k", { metaKey: true });
		for (const key of "oauth") press(key);
		await screen.findByRole("dialog", { name: "Command palette" });
		await waitFor(() => expect(paletteInput().value).toBe("oauth"));
		expect(router.state.location.pathname).toBe("/p/CDE/table");
	});
});
