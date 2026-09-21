import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Resource } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { EpicResources } from "./EpicResources";

const epic = "OP/routines-e2e";

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

// Two resources of the Routines E2E epic, from section 2, screen 8 of
// docs/research/trellis-for-one-human-and-many-agents.md.
const resources: Resource[] = [
	{ ...base, id: "01AAAAAAAAAAAAAAAAAAAAAAA1", kind: "doc", name: "routine-runtime.md", body: "# The runtime" },
	{
		...base,
		id: "01AAAAAAAAAAAAAAAAAAAAAAA2",
		kind: "link",
		name: "canary#55569",
		url: "https://github.com/canary/canary/pull/55569",
	},
];

const queryKey = ["resources", "list", epic];

// The section reads one procedure. The stand-in returns the key that the test
// seeds, so a row of the list comes from the query cache.
const appOf = (queryClient: QueryClient) =>
	({
		queryClient,
		orpc: { resources: { list: { queryOptions: () => ({ queryKey, queryFn: () => resources }) } } },
	}) as unknown as AppContext;

const render = () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(queryKey, resources);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={appOf(queryClient)}>
				<EpicResources epic={epic} />
			</AppProvider>
		</QueryClientProvider>,
	);
};

describe("EpicResources", () => {
	test("prints every resource of the epic", () => {
		const html = render();

		expect(html).toContain("routine-runtime.md");
		expect(html).toContain("canary#55569");
	});

	test("draws no header and no Show control, because the tab label names the list", () => {
		const html = render();

		expect(html).not.toContain("<h2");
		expect(html).not.toContain(">Show<");
		expect(html).not.toContain("aria-expanded");
	});

	test("offers no Add control, because `trellis resource add` adds a resource", () => {
		const html = render();

		expect(html).not.toContain('aria-label="Add a resource"');
	});
});
