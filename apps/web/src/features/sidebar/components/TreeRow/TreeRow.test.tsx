import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { TreeRow } from "./TreeRow";

const project = {
	id: "01M24SPHTX36AJ3VKTNZ263E7V",
	key: "TRL",
	path: "TRL",
	parentId: null,
	rootId: "01M24SPHTX36AJ3VKTNZ263E7V",
	slug: "trellis",
	name: "Trellis",
	depth: 0,
	position: 0,
	openCount: 12,
	openEpicCount: 3,
	archivedAt: null,
} satisfies ProjectSummary;

test("the project row toggles collapse without a link or caret slot", () => {
	const html = renderToStaticMarkup(<TreeRow project={project} depth={0} expanded={false} onToggle={() => {}} />);

	expect(html).toContain('<button type="button" aria-expanded="false"');
	expect(html).toContain(">Trellis<");
	expect(html).toContain(">12<");
	expect(html).not.toContain("<a ");
	expect(html).not.toContain("Collapse Trellis");
	expect(html).not.toContain("Expand Trellis");
});
