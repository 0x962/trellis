import { describe, expect, mock, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DescriptionEditor } from "./DescriptionEditor";

const mount = async (markdown: string) => {
	const onChange = mock((_markdown: string) => {});
	const view = render(<DescriptionEditor markdown={markdown} onChange={onChange} />);
	const editor = await waitFor(() => {
		const found = view.container.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]');
		expect(found).not.toBeNull();
		return found!;
	});
	return { onChange, editor };
};

const lastMarkdown = (onChange: ReturnType<typeof mock>) => (onChange.mock.calls.at(-1)?.[0] ?? "") as string;

describe("features/composer/DescriptionEditor", () => {
	// Spec CP-1. Inside a list, "- " starts a list item. It must not stay in
	// the text as a literal dash, which the saved markdown would then escape.
	test("typing '- ' in a new list item leaves no literal dash", async () => {
		const user = userEvent.setup();
		const { onChange, editor } = await mount("- one");
		editor.focus();
		await user.keyboard("{Enter}- two");
		await waitFor(() => expect(lastMarkdown(onChange)).toContain("two"));
		const markdown = lastMarkdown(onChange);
		expect(markdown).not.toMatch(/\\-|-\s+-\s/);
		expect(editor.textContent).not.toContain("- two");
	});
});
