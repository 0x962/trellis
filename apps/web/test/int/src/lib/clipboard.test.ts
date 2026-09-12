import { beforeEach, describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { Toaster } from "@trellis/ui";
import { createElement } from "react";
import { mockClipboard } from "../../../inbox";
import { copyText } from "../../../../src/lib/clipboard";

beforeEach(() => {
	document.body.innerHTML = "";
});

describe("lib/clipboard", () => {
	// A copy has no result on the page, so the toast shows what went to
	// the clipboard, in mono, on one line.
	test("copyText writes the text and shows it under the message", async () => {
		const clipboard = mockClipboard();
		render(createElement(Toaster));
		await act(() => copyText("trellis list --project CDE.web", "Copied the CLI command"));
		expect(clipboard.written).toEqual(["trellis list --project CDE.web"]);
		expect(await screen.findByText("Copied the CLI command")).toBeDefined();
		const text = screen.getByText("trellis list --project CDE.web");
		for (const name of ["font-mono", "text-xs", "text-fg-muted", "truncate"]) {
			expect(text.classList.contains(name)).toBe(true);
		}
	});
});
