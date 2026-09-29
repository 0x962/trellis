import { describe, expect, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { createTrellisClient, type FetchLike, type Resource, realScheduler } from "@trellis/api";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { createLive } from "../../../lib/live";
import { ResourceList } from "./ResourceList";

// ResourceList reads the application context and the router during its
// render, for the link hook. No case here sends a request or navigates, so
// the fixture holds a real client over a transport that refuses every
// request, a live connection that never starts, and a router with one
// memory route around the element.
const noRequest: FetchLike = (request) => {
	throw new Error(`The test expected no request, and the app sent one to ${request.url}.`);
};

const app = (): AppContext => {
	const queryClient = new QueryClient();
	const client = createTrellisClient("http://127.0.0.1:4521", "human:navidkhan", noRequest);
	const live = createLive({
		queryClient,
		locks: { request: async () => undefined },
		createChannel: () => ({ postMessage: () => {}, addEventListener: () => {}, close: () => {} }),
		EventSource: class {
			addEventListener() {}
			close() {}
		},
		scheduler: realScheduler,
	});
	return { queryClient, orpc: createTanstackQueryUtils(client), client, live, scheduler: realScheduler };
};

const render = async (element: ReactNode) => {
	const context = app();
	const root = createRootRoute({
		component: () => (
			<QueryClientProvider client={context.queryClient}>
				<AppProvider value={context}>{element}</AppProvider>
			</QueryClientProvider>
		),
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/p/OP/epics/routines-e2e"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
};

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
	test("groups the resources under Documents, Links, Images and Files", async () => {
		const html = await render(<ResourceList resources={resources} {...controls} />);

		const headings = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((match) => match[1]);
		expect(headings).toEqual(["Documents", "Links", "Images", "Files"]);
		expect(html.indexOf("The routine runtime")).toBeLessThan(html.indexOf(">Links<"));
		expect(html.indexOf("canary#55569")).toBeLessThan(html.indexOf(">Images<"));
		expect(html.indexOf("op27-send-timeout.gif")).toBeLessThan(html.indexOf(">Files<"));
		expect(html.indexOf(">Files<")).toBeLessThan(html.indexOf("settle-sequence.mmd"));
	});

	test("draws the epic description first among the documents", async () => {
		const html = await render(<ResourceList resources={resources} {...controls} />);

		expect(html.indexOf("Routines E2E")).toBeLessThan(html.indexOf("The routine runtime"));
		expect(html).toContain('title="The epic description"');
	});

	test("shows the detail of each kind as the tooltip of its row", async () => {
		const html = await render(<ResourceList resources={resources} {...controls} />);

		expect(html).toContain('title="Edited Sep 19 by crisp-fjord"');
		expect(html).toContain('title="github.com"');
		expect(html).toContain('title="1.2 KB"');
	});

	test("names the pull request of a resource that is also evidence", async () => {
		const html = await render(<ResourceList resources={resources} {...controls} />);

		expect(html).toContain('title="55.0 KB · also evidence on #56930"');
	});

	test("shows no heading for a kind the epic does not hold", async () => {
		const html = await render(<ResourceList resources={[]} {...controls} />);

		expect(html).toContain(">Documents<");
		expect(html).toContain("Routines E2E");
		expect(html).not.toContain(">Links<");
		expect(html).not.toContain(">Images<");
		expect(html).not.toContain(">Files<");
	});

	test("offers New document in every state, and no control without a writer", async () => {
		for (const html of await Promise.all([
			render(<ResourceList resources={resources} {...controls} />),
			render(<ResourceList resources={[]} {...controls} loading />),
			render(<ResourceList resources={[]} {...controls} error="The server did not answer." />),
		])) {
			expect(html).toContain('aria-label="New document"');
		}
		const readOnly = await render(<ResourceList resources={resources} {...controls} onNewDocument={undefined} />);
		expect(readOnly).not.toContain('aria-label="New document"');
	});

	test("marks the open document, and says Untitled for a document with no title", async () => {
		const untitled: Resource = { ...resources[0]!, id: "01AAAAAAAAAAAAAAAAAAAAAAA5", name: "", body: "" };
		const html = await render(
			<ResourceList resources={[untitled]} {...controls} openDocId="01AAAAAAAAAAAAAAAAAAAAAAA5" />,
		);

		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		expect(html.slice(html.indexOf('aria-current="page"'))).toContain("Untitled");
	});

	test("waits under the epic description while the resources load", async () => {
		const html = await render(<ResourceList resources={[]} {...controls} loading />);

		expect(html).toContain('aria-busy="true"');
		expect(html).toContain("Routines E2E");
		expect(html).not.toContain("The epic holds no resource.");
	});

	test("prints the words of the server when the read fails", async () => {
		const html = await render(<ResourceList resources={[]} {...controls} error="The server did not answer." />);

		expect(html).toContain('role="alert"');
		expect(html).toContain("The server did not answer.");
		expect(html).not.toContain("The epic holds no resource.");
	});
});
