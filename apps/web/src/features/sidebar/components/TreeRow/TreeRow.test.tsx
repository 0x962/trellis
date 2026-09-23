import { expect, test } from "bun:test";
import type { ProjectSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { TreeRow } from "./TreeRow";

const project = {
	id: "01M24SPHTX36AJ3VKTNZ263E7V",
	key: "TRL",
	slug: "trellis",
	name: "Trellis",
	position: 0,
	openCount: 12,
	openEpicCount: 3,
	color: null,
	archivedAt: null,
} satisfies ProjectSummary;

test("the project row toggles collapse without a link or caret slot", () => {
	const html = renderToStaticMarkup(<TreeRow project={project} expanded={false} onToggle={() => {}} />);

	expect(html).toContain('<button type="button" aria-expanded="false"');
	expect(html).toContain(">Trellis<");
	expect(html).toContain(">12<");
	expect(html).not.toContain("<a ");
	expect(html).not.toContain("Collapse Trellis");
	expect(html).not.toContain("Expand Trellis");
});

test("the row draws the mark of the project in the color of the project", () => {
	const html = renderToStaticMarkup(<TreeRow project={{ ...project, color: "teal" }} />);

	expect(html).toContain('class="project-mark inline-flex size-6" data-project-color="teal"');
	expect(html).toContain('class="agent-ground"');
});

test("a project with no color keeps the plain mark", () => {
	const html = renderToStaticMarkup(<TreeRow project={project} />);

	expect(html).not.toContain("project-mark");
	expect(html).toContain('data-background="false"');
});
