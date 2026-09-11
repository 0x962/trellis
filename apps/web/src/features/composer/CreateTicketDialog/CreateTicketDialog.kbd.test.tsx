import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, screen, within } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { openPalette, renderShell, resetStores } from "../../../../test/palette";
import { renderApp } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { findGrid, resetUi } from "../../../../test/table";
import { tableViewport } from "../../../../test/viewport";
import { composerActions } from "../composerStore";

const installViewport = tableViewport(800);

beforeEach(() => {
	localStorage.clear();
	resetUi();
	resetStores();
	installViewport();
	mockMatchMedia(false);
});

afterEach(() => act(resetUi));

// The one key cap style: the surface fill, the strong border, the square
// corner, and 11 px mono. A call site adds layout classes such as shrink-0,
// and nothing else.
const capStyle = [
	"inline-flex",
	"h-4.5",
	"min-w-4.5",
	"items-center",
	"justify-center",
	"rounded-sm",
	"border",
	"border-border-strong",
	"bg-surface",
	"px-1",
	"font-mono",
	"text-xs",
	"leading-none",
	"text-fg-muted",
];

const styleOf = (cap: HTMLElement) => cap.className.split(" ").filter((name) => capStyle.includes(name));

// TRL-34. The sidebar hint, the topbar shortcut, and the composer shortcut
// were three different chips. The composer draws its cap inside a primary
// button and the palette draws its caps in a footer row, so the two are the
// pair that used to disagree most. Both now draw the Kbd primitive.
describe("features/composer: one key cap style", () => {
	test("the composer footer and the palette footer draw the same element", async () => {
		renderApp({ path: "/p/CDE/table", actor: "dana", server: createTestServer() });
		await findGrid();
		act(() => composerActions.open({}));
		const dialog = await screen.findByRole("dialog", { name: "New ticket" });
		const create = within(dialog).getByRole("button", { name: /^Create/ });
		const composerCap = create.querySelector("kbd")!;
		expect(composerCap.textContent).toBe("⌘↩");
		expect(styleOf(composerCap)).toEqual(capStyle);
		act(resetUi);

		renderShell();
		await openPalette();
		const paletteCap = screen.getByText("↑↓");
		expect(paletteCap.tagName).toBe(composerCap.tagName);
		expect(styleOf(paletteCap)).toEqual(styleOf(composerCap));
	});

	// A shortcut inside a button carried its own border and a full-height
	// segment, which is what made it a third style.
	test("the composer shortcut carries no segment border of its own", async () => {
		renderApp({ path: "/p/CDE/table", actor: "dana", server: createTestServer() });
		await findGrid();
		act(() => composerActions.open({}));
		const dialog = await screen.findByRole("dialog", { name: "New ticket" });
		const cap = within(dialog)
			.getByRole("button", { name: /^Create/ })
			.querySelector("kbd")!;
		expect(cap.className).not.toMatch(/border-r|self-stretch|border-inherit/);
	});
});
