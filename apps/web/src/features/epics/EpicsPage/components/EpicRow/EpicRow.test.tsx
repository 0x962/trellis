import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { EpicSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { EpicRow } from "./EpicRow";

const epic = {
	id: "01M2YRWY0TEG6ETHHWRHVDQ5AH",
	projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
	projectKey: "TRL",
	ref: "TRL/trellis-for-one-human-and-many-agents",
	slug: "trellis-for-one-human-and-many-agents",
	name: "Trellis for one human and many agents",
	description: "",
	counts: { total: 279, todo: 7, started: 1, review: 0, done: 269, canceled: 2 },
	state: "open",
	currentWave: {
		id: "01M3D42Y2A4SYSX29KM89SRYRF",
		ref: "TRL/trellis-for-one-human-and-many-agents/row-hover-stability",
		name: "Row Hover Stability",
	},
	currentWaveIndex: 28,
	waveCount: 28,
	resourceCount: 0,
	actor: { name: "Agent", kind: "agent" },
	createdAt: "2026-09-20T00:00:00.000Z",
	updatedAt: "2026-09-25T20:28:54.834Z",
} satisfies EpicSummary;

const render = async () => {
	const root = createRootRoute({
		component: () => <EpicRow epic={epic} density="compact" readOnly onEdit={() => {}} onDelete={() => {}} />,
	});
	const route = createRoute({ getParentRoute: () => root, path: "/p/$", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/p/TRL/epics"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
};

test("the static epic row contains its inset hover background", async () => {
	const html = await render();
	const row = html.match(/<li [^>]*data-epic="trellis-for-one-human-and-many-agents"[^>]*>/)?.[0] ?? "";

	expect(row).toContain("relative");
	expect(row).toContain("after:absolute");
	expect(row).toContain("hover:after:bg-band");
});
