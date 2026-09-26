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

const render = (props: { description?: string; resourceId?: string } = {}) => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(queryKey, resources);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={appOf(queryClient)}>
				<EpicResources
					epic={epic}
					description={props.description ?? "# Routines E2E\n\nThe goal: settle every routine."}
					readOnly={false}
					resourceId={props.resourceId}
				/>
			</AppProvider>
		</QueryClientProvider>,
	);
};

describe("EpicResources", () => {
	test("lists the epic description first, titled with its first heading, then every resource", () => {
		const html = render();

		expect(html).toContain("Routines E2E");
		expect(html.indexOf("Routines E2E")).toBeLessThan(html.indexOf("routine-runtime.md"));
		expect(html).toContain("canary#55569");
	});

	test("titles a description with no heading Untitled", () => {
		const html = render({ description: "Settle every routine." });

		expect(html).toContain(">Untitled<");
	});

	test("opens the epic description beside the list", () => {
		const html = render();
		const current = html.slice(html.indexOf('aria-current="page"'));

		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		expect(current).toContain("Routines E2E");
	});

	test("selects the resource that an internal link names", () => {
		const html = render({ resourceId: resources[1]!.id });
		const current = html.slice(html.indexOf('aria-current="page"'));

		expect(current).toContain("canary#55569");
	});

	test("offers New document, and no Add menu for links and files", () => {
		const html = render();

		expect(html).toContain('aria-label="New document"');
		expect(html).not.toContain('aria-label="Add a resource"');
	});
});
