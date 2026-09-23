import { expect, test } from "bun:test";
import type { LabelGroup } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { LabelGroupRow } from "./LabelGroupRow";

const group = { id: "g1", projectId: "p1", name: "Area" } as LabelGroup;

const markup = (renaming: boolean) =>
	renderToStaticMarkup(
		<LabelGroupRow
			group={group}
			labelCount={3}
			expanded
			renaming={renaming}
			menuRef={null}
			onToggle={() => {}}
			onRenamingChange={() => {}}
			onRename={async () => {}}
			onNewLabel={() => {}}
			onDelete={() => {}}
		>
			<p>The labels of the group</p>
		</LabelGroupRow>,
	);

test("at rest the name is the label of the collapse button and no text field", () => {
	const html = markup(false);

	expect(html).toContain('data-inline-edit="value"');
	expect(html).toContain("label-group-toggle");
	expect(html).not.toContain("<input");
});

test("a rename draws the name as a text field and draws no collapse button", () => {
	const html = markup(true);

	expect(html).toContain('data-inline-edit="editing"');
	expect(html).toContain('value="Area"');
	expect(html).not.toContain("label-group-toggle");
});

test("the labels of the group stay under the band while the name field is open", () => {
	expect(markup(true)).toContain("The labels of the group");
});
