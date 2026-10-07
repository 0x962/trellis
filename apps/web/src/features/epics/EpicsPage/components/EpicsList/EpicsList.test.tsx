import { describe, expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { EpicSummary } from "@trellis/api";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EpicsList, type EpicsListProps } from "./EpicsList";

const epic = {
	id: "01M2YRWY0TEG6ETHHWRHVDQ5AH",
	projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
	projectKey: "TRL",
	ref: "TRL/quality",
	slug: "quality",
	name: "A long epic name that remains available on narrow screens",
	description: "",
	counts: { total: 10, todo: 3, started: 2, review: 1, done: 3, canceled: 1 },
	state: "open",
	currentWave: null,
	currentWaveIndex: null,
	waveCount: 0,
	resourceCount: 0,
	actor: { name: "Agent", kind: "agent" },
	createdAt: "2026-09-20T00:00:00.000Z",
	updatedAt: "2026-09-25T20:28:54.834Z",
} satisfies EpicSummary;

const controls = {
	projectId: epic.projectId,
	pending: false,
	error: null,
	retrying: false,
	readOnly: false,
	isCollapsed: () => false,
	onToggle: () => {},
	onRetry: () => {},
	onNew: () => {},
	onEdit: () => {},
	onDelete: () => {},
} satisfies Omit<EpicsListProps, "groups">;

const render = async (element: ReactNode) => {
	const root = createRootRoute({ component: () => element });
	const route = createRoute({ getParentRoute: () => root, path: "/p/$", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/p/TRL/epics"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
};

describe("epic list states", () => {
	test("shows stable row placeholders while the list loads", async () => {
		const html = await render(<EpicsList {...controls} groups={[]} pending />);

		expect(html).toContain('aria-busy="true"');
		expect(html.match(/max-md:min-h-14/g)).toHaveLength(4);
		expect(html).not.toContain("No epics");
	});

	test("reports the failed request while the query retries", async () => {
		const html = await render(
			<EpicsList {...controls} groups={[]} pending error={new Error("Connection refused")} retrying />,
		);

		expect(html).toContain("The epics did not load");
		expect(html).toContain("Trellis is trying again.");
		expect(html).not.toContain(">Retry<");
		expect(html).not.toContain("No epics");
	});

	test("shows a recoverable failure when no saved row exists", async () => {
		const html = await render(<EpicsList {...controls} groups={[]} error={new Error("Connection refused")} />);

		expect(html).toContain('role="alert"');
		expect(html).toContain("The epics did not load");
		expect(html).toContain("Retry");
		expect(html).toContain("Details");
		expect(html).toContain("Connection refused");
		expect(html).not.toContain("No epics");
	});

	test("keeps saved rows below a refresh failure", async () => {
		const groups = [{ key: "open" as const, label: "Open", epics: [epic] }];
		const html = await render(<EpicsList {...controls} groups={groups} error={new Error("The refresh stopped")} />);

		expect(html).toContain("The epics did not refresh");
		expect(html).toContain("The saved epics remain below");
		expect(html).toContain(epic.name);
	});

	test("keeps saved rows and reports an automatic refresh retry", async () => {
		const groups = [{ key: "open" as const, label: "Open", epics: [epic] }];
		const html = await render(
			<EpicsList {...controls} groups={groups} error={new Error("The refresh stopped")} retrying />,
		);

		expect(html).toContain("The epics did not refresh");
		expect(html).toContain("Trellis is trying again.");
		expect(html).not.toContain(">Retry<");
		expect(html).toContain(epic.name);
	});

	test("offers creation only for an active empty project", async () => {
		const active = await render(<EpicsList {...controls} groups={[]} />);
		const archived = await render(<EpicsList {...controls} groups={[]} readOnly />);

		expect(active).toContain("New epic");
		expect(archived).not.toContain("New epic");
	});

	test("renders a canceled group and its saved epic", async () => {
		const canceled = { ...epic, state: "canceled" as const, name: "Canceled plan" };
		const html = await render(
			<EpicsList {...controls} groups={[{ key: "canceled", label: "Canceled", epics: [canceled] }]} />,
		);

		expect(html).toContain("Canceled epics");
		expect(html).toContain("Canceled plan");
	});
});
