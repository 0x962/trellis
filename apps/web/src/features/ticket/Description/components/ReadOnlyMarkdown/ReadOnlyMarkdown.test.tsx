import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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
});
