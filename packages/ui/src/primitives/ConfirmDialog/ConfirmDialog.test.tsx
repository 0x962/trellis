import { expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmDialog } from "./ConfirmDialog";

test("confirmDisabled blocks only the confirm action", () => {
	const dialog = ConfirmDialog({
		open: true,
		title: "Delete status?",
		description: "Select a replacement.",
		confirmLabel: "Delete status",
		confirmDisabled: true,
		onConfirm: () => {},
		onCancel: () => {},
	});
	const actions = (dialog.props.children as unknown[]).at(-1) as ReactNode;
	const html = renderToStaticMarkup(actions);
	expect(html).toContain("<button");
	expect(html).toContain(">Cancel</span>");
	expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Delete status/s);
	expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>.*Cancel<\/span><\/span><\/button>/s);
});
