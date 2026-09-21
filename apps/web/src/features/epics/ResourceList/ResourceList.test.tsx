import { describe, expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceList } from "./ResourceList";

const controls = {
	planTitle: "Routines E2E",
	openDocId: "plan",
	onOpenDoc: () => {},
	onAdd: { doc: () => {}, link: () => {}, file: () => {} },
};

const base = {
	epicId: "01M2YRWY0TEG6ETHHWRHVDQ5AH",
	body: null,
	url: null,
	blob: null,
	ticketId: null,
	pullRequestNumber: null,
	actor: { name: "crisp-fjord", kind: "agent" as const },
	createdAt: "2026-09-19T10:00:00.000Z",
	updatedAt: "2026-09-19T10:00:00.000Z",
};

// The resources of the Routines E2E epic, from section 2, screen 8 of
// docs/research/trellis-for-one-human-and-many-agents.md.
const resources: Resource[] = [
	{ ...base, id: "01AAAAAAAAAAAAAAAAAAAAAAA1", kind: "doc", name: "The routine runtime", body: "# The runtime" },
	{
		...base,
		id: "01AAAAAAAAAAAAAAAAAAAAAAA2",
		kind: "link",
		name: "canary#55569",
		url: "https://github.com/canary/canary/pull/55569",
	},
	{
		...base,
		id: "01AAAAAAAAAAAAAAAAAAAAAAA3",
		kind: "image",
		name: "op27-send-timeout.gif",
		blob: { sha256: "a".repeat(64), url: "/blobs/a", size: 56320 },
		pullRequestNumber: 56930,
	},
	{
		...base,
		id: "01AAAAAAAAAAAAAAAAAAAAAAA4",
		kind: "file",
		name: "settle-sequence.mmd",
		blob: { sha256: "b".repeat(64), url: "/blobs/b", size: 1229 },
	},
];

describe("ResourceList", () => {
	test("prints the four kinds in one list, each with its kind word", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);

		expect(html).toContain(">doc<");
		expect(html).toContain(">link<");
		expect(html).toContain(">image<");
		expect(html).toContain(">file<");
		expect(html).toContain("The routine runtime");
		expect(html).toContain("settle-sequence.mmd");
		expect(html).toContain("(5)");
	});

	test("draws the epic description first, then keeps the order the server gives", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);

		expect(html.indexOf("Routines E2E")).toBeLessThan(html.indexOf("The routine runtime"));
		expect(html).toContain("the epic description");
		expect(html.indexOf("The routine runtime")).toBeLessThan(html.indexOf("canary#55569"));
		expect(html.indexOf("canary#55569")).toBeLessThan(html.indexOf("op27-send-timeout.gif"));
		expect(html.indexOf("op27-send-timeout.gif")).toBeLessThan(html.indexOf("settle-sequence.mmd"));
	});

	test("writes a detail line for each kind", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);

		expect(html).toContain("edited Sep 19 by crisp-fjord");
		expect(html).toContain("github.com · opens in the in-app browser");
		expect(html).toContain("55.0 KB");
		expect(html).toContain("1.2 KB");
	});

	test("prints the pull request after the size of a resource that is also evidence", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);
		const image = html.slice(html.indexOf("op27-send-timeout.gif"));

		expect(image).toContain("55.0 KB · also evidence on #56930");
		expect(html.slice(html.indexOf("settle-sequence.mmd"))).not.toContain("also evidence");
	});

	test("offers the add control in every state", () => {
		for (const html of [
			renderToStaticMarkup(<ResourceList resources={resources} {...controls} />),
			renderToStaticMarkup(<ResourceList resources={[]} {...controls} />),
			renderToStaticMarkup(<ResourceList resources={[]} loading {...controls} />),
			renderToStaticMarkup(<ResourceList resources={[]} error="The server did not answer." {...controls} />),
		]) {
			expect(html).toContain('aria-label="Add a resource"');
		}
	});

	test("draws the epic description when the epic holds no resource", () => {
		const html = renderToStaticMarkup(<ResourceList resources={[]} {...controls} />);

		expect(html).toContain("Routines E2E");
		expect(html).toContain("(1)");
	});

	test("marks the open document, and says Untitled for a document with no title", () => {
		const untitled: Resource = { ...resources[0]!, id: "01AAAAAAAAAAAAAAAAAAAAAAA5", name: "", body: "" };
		const html = renderToStaticMarkup(
			<ResourceList resources={[untitled]} {...controls} openDocId="01AAAAAAAAAAAAAAAAAAAAAAA5" />,
		);

		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		expect(html.slice(html.indexOf('aria-current="page"'))).toContain("Untitled");
	});

	test("waits with no count and no empty words while the resources load", () => {
		const html = renderToStaticMarkup(<ResourceList resources={[]} loading {...controls} />);

		expect(html).toContain('aria-busy="true"');
		expect(html).not.toContain("(0)");
		expect(html).not.toContain("The epic holds no resource.");
	});

	test("keeps the number of the caller while the rows are on their way", () => {
		const html = renderToStaticMarkup(<ResourceList resources={[]} count={5} loading {...controls} />);

		expect(html).toContain("(5)");
	});

	test("counts its own rows as soon as it has them", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} count={6} {...controls} />);

		expect(html).toContain("(5)");
		expect(html).not.toContain("(6)");
	});

	test("draws the rows alone when the caller names the list in a tab", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} header={false} />);

		expect(html).not.toContain("<h2");
		expect(html).not.toContain("(5)");
		expect(html).toContain("The routine runtime");
	});

	test("prints no number when the read failed", () => {
		const html = renderToStaticMarkup(
			<ResourceList resources={[]} count={5} error="The server did not answer." {...controls} />,
		);

		expect(html).not.toContain("(5)");
	});

	test("prints the words of the server when the read fails", () => {
		const html = renderToStaticMarkup(<ResourceList resources={[]} error="The server did not answer." {...controls} />);

		expect(html).toContain('role="alert"');
		expect(html).toContain("The server did not answer.");
		expect(html).not.toContain("The epic holds no resource.");
	});
});
