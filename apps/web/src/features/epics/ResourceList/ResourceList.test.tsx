import { describe, expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceList } from "./ResourceList";

const controls = {
	planTitle: "Routines E2E",
	openDocId: "plan",
	onOpenDoc: () => {},
	loading: false,
	error: null,
	onNewDocument: () => {},
	newDocumentPending: false,
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
	test("groups the resources under Documents, Links, Images and Files", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);

		const headings = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((match) => match[1]);
		expect(headings).toEqual(["Documents", "Links", "Images", "Files"]);
		expect(html.indexOf("The routine runtime")).toBeLessThan(html.indexOf(">Links<"));
		expect(html.indexOf("canary#55569")).toBeLessThan(html.indexOf(">Images<"));
		expect(html.indexOf("op27-send-timeout.gif")).toBeLessThan(html.indexOf(">Files<"));
		expect(html.indexOf(">Files<")).toBeLessThan(html.indexOf("settle-sequence.mmd"));
	});

	test("draws the epic description first among the documents", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);

		expect(html.indexOf("Routines E2E")).toBeLessThan(html.indexOf("The routine runtime"));
		expect(html).toContain('title="The epic description"');
	});

	test("shows the detail of each kind as the tooltip of its row", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);

		expect(html).toContain('title="Edited Sep 19 by crisp-fjord"');
		expect(html).toContain('title="github.com"');
		expect(html).toContain('title="1.2 KB"');
	});

	test("names the pull request of a resource that is also evidence", () => {
		const html = renderToStaticMarkup(<ResourceList resources={resources} {...controls} />);

		expect(html).toContain('title="55.0 KB · also evidence on #56930"');
	});

	test("shows no heading for a kind the epic does not hold", () => {
		const html = renderToStaticMarkup(<ResourceList resources={[]} {...controls} />);

		expect(html).toContain(">Documents<");
		expect(html).toContain("Routines E2E");
		expect(html).not.toContain(">Links<");
		expect(html).not.toContain(">Images<");
		expect(html).not.toContain(">Files<");
	});

	test("offers New document in every state, and no control without a writer", () => {
		for (const html of [
			renderToStaticMarkup(<ResourceList resources={resources} {...controls} />),
			renderToStaticMarkup(<ResourceList resources={[]} {...controls} loading />),
			renderToStaticMarkup(<ResourceList resources={[]} {...controls} error="The server did not answer." />),
		]) {
			expect(html).toContain('aria-label="New document"');
		}
		const readOnly = renderToStaticMarkup(
			<ResourceList resources={resources} {...controls} onNewDocument={undefined} />,
		);
		expect(readOnly).not.toContain('aria-label="New document"');
	});

	test("marks the open document, and says Untitled for a document with no title", () => {
		const untitled: Resource = { ...resources[0]!, id: "01AAAAAAAAAAAAAAAAAAAAAAA5", name: "", body: "" };
		const html = renderToStaticMarkup(
			<ResourceList resources={[untitled]} {...controls} openDocId="01AAAAAAAAAAAAAAAAAAAAAAA5" />,
		);

		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		expect(html.slice(html.indexOf('aria-current="page"'))).toContain("Untitled");
	});

	test("waits under the epic description while the resources load", () => {
		const html = renderToStaticMarkup(<ResourceList resources={[]} {...controls} loading />);

		expect(html).toContain('aria-busy="true"');
		expect(html).toContain("Routines E2E");
		expect(html).not.toContain("The epic holds no resource.");
	});

	test("prints the words of the server when the read fails", () => {
		const html = renderToStaticMarkup(<ResourceList resources={[]} {...controls} error="The server did not answer." />);

		expect(html).toContain('role="alert"');
		expect(html).toContain("The server did not answer.");
		expect(html).not.toContain("The epic holds no resource.");
	});
});
