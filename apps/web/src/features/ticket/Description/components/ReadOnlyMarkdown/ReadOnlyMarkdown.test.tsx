import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadOnlyMarkdown } from "./ReadOnlyMarkdown";

const markdown = [
	"## Acceptance",
	"",
	"- [x] The five routes render",
	"- [ ] The desktop typecheck is green",
	"",
	"| check | state |",
	"| --- | --- |",
	"| lint | pass |",
	"",
	"```sh",
	'grep -rn "CDE FORK"',
	"```",
].join("\n");

describe("features/ticket/Description/components/ReadOnlyMarkdown", () => {
	// WT-32. A description opens as formatted text, never as an editor. The
	// ProseMirror class marks the editor's own DOM.
	test("renders GFM markdown read-only", () => {
		const { container } = render(<ReadOnlyMarkdown markdown={markdown} />);
		expect(screen.getByRole("heading", { level: 2, name: "Acceptance" })).toBeDefined();
		const boxes = container.querySelectorAll('input[type="checkbox"]');
		expect(boxes).toHaveLength(2);
		expect((boxes[0] as HTMLInputElement).checked).toBe(true);
		expect((boxes[1] as HTMLInputElement).checked).toBe(false);
		for (const box of boxes) expect(box.hasAttribute("disabled")).toBe(true);
		expect(container.querySelector("table")).not.toBeNull();
		expect(container.querySelector("th")!.textContent).toBe("check");
		const code = container.querySelector("pre code");
		expect(code).not.toBeNull();
		expect(code!.textContent).toContain('grep -rn "CDE FORK"');
		expect(code!.className).toContain("language-sh");
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(container.querySelector("[contenteditable]")).toBeNull();
		expect(container.querySelector(".ProseMirror")).toBeNull();
	});

	// TK-9. A pasted image points at its attachment file on this server. It
	// renders, and a click opens it large in a lightbox.
	test("an attachment image renders and opens in a lightbox", async () => {
		const user = userEvent.setup();
		const src = "/api/attachments/01J0000000000000000000000A/file";
		render(<ReadOnlyMarkdown markdown={`![trace.png](${src})`} />);
		const image = screen.getByRole("img", { name: "trace.png" });
		expect(image.getAttribute("src")).toBe(src);
		await user.click(image);
		const dialog = await screen.findByRole("dialog", { name: "trace.png" });
		expect(within(dialog).getByRole("img", { name: "trace.png" }).getAttribute("src")).toBe(src);
	});
});
