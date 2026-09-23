import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineEdit } from "./InlineEdit";

const save = async () => {};

test("at rest it draws the value and no text field", () => {
	const html = renderToStaticMarkup(
		<InlineEdit label="Session name" value="Old name" editing={false} onEditingChange={() => {}} onCommit={save}>
			<h2 className="truncate text-sm font-medium">Old name</h2>
		</InlineEdit>,
	);

	expect(html).toContain('data-inline-edit="value"');
	expect(html).toContain("<h2");
	expect(html).not.toContain("<input");
});

test("while editing it draws the text field with the saved value and hides the value at rest", () => {
	const html = renderToStaticMarkup(
		<InlineEdit label="Session name" value="Old name" editing onEditingChange={() => {}} onCommit={save}>
			<h2 className="truncate text-sm font-medium">Old name</h2>
		</InlineEdit>,
	);

	expect(html).toContain('data-inline-edit="editing"');
	expect(html).toContain('value="Old name"');
	expect(html).not.toContain("<h2");
});

test("the label names the field for a screen reader and stays off the screen", () => {
	const html = renderToStaticMarkup(
		<InlineEdit label="Session name" value="Old name" editing onEditingChange={() => {}} onCommit={save} />,
	);

	expect(html).toContain("Session name");
	expect(html).toContain("sr-only");
});

// The box holds the focus after Enter and after Escape, so the next Tab
// starts from the value and never from the top of the page.
test("the box takes the focus by code and stays out of the tab order", () => {
	const html = renderToStaticMarkup(
		<InlineEdit label="Session name" value="Old name" editing={false} onEditingChange={() => {}} onCommit={save}>
			<span>Old name</span>
		</InlineEdit>,
	);

	expect(html).toContain('tabindex="-1"');
});

test("the leading mark stands beside the field, so the row does not move sideways", () => {
	const html = renderToStaticMarkup(
		<InlineEdit
			label="Session name"
			value="Old name"
			editing
			onEditingChange={() => {}}
			onCommit={save}
			leading={<span data-testid="avatar" />}
		/>,
	);

	expect(html).toContain('data-testid="avatar"');
});

test("the leading mark is gone at rest, because the value at rest draws its own", () => {
	const html = renderToStaticMarkup(
		<InlineEdit
			label="Session name"
			value="Old name"
			editing={false}
			onEditingChange={() => {}}
			onCommit={save}
			leading={<span data-testid="avatar" />}
		>
			<span>Old name</span>
		</InlineEdit>,
	);

	expect(html).not.toContain('data-testid="avatar"');
});

test("the field takes the type size of the value it covers", () => {
	const html = renderToStaticMarkup(
		<InlineEdit
			label="Session name"
			value="Old name"
			editing
			onEditingChange={() => {}}
			onCommit={save}
			inputClassName="h-9 text-lg font-semibold"
		/>,
	);

	expect(html).toContain("h-9 text-lg font-semibold");
});
