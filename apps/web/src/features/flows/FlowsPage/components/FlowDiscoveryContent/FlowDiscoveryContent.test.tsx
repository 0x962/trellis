import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowSettingsFeedback } from "../../../FlowEditor/components/FlowSettingsSheet/components/FlowSettingsFeedback";
import { FlowVersionDetails } from "../../../FlowEditor/components/FlowSettingsSheet/components/FlowVersionDetails";
import {
	blockedDiscoveryEntry,
	deletedFlowFixture,
	discoveryFixture,
	metadataConflictFixture,
	pendingDiscoveryEntry,
} from "../../flowDiscovery/flowDiscovery.fixtures";
import { FlowDiscoveryContent } from "./FlowDiscoveryContent";

async function render(content: ReactNode) {
	const root = createRootRoute({ component: () => content });
	const route = createRoute({ getParentRoute: () => root, path: "/ai/flows", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/ai/flows"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
}

test("presents the saved and executable revisions separately", () => {
	const html = renderToStaticMarkup(<FlowVersionDetails entry={pendingDiscoveryEntry} />);
	expect(html).toContain("Saved version");
	expect(html).toContain('class="tabular-nums">2');
	expect(html).toContain('class="tabular-nums">1');
	expect(html).toContain("Pending");
	expect(html).toContain("The older executable revision does not permit a new run.");
});

test("keeps conversion diagnostics and capability reasons explicit", () => {
	const html = renderToStaticMarkup(<FlowVersionDetails entry={blockedDiscoveryEntry} />);
	expect(html).toContain("Conversion blocked");
	expect(html).toContain("UNSUPPORTED_COMPONENT");
	expect(html).toContain("The service must confirm run capability.");
});

test("keeps the stable slug link during an engine outage", async () => {
	const html = await render(
		<FlowDiscoveryContent
			input={{ ...discoveryFixture, engine: { state: "unavailable", reason: "Offline" } }}
			retryAction={null}
			clearFiltersAction={null}
		/>,
	);
	expect(html).toContain("Flow engine unavailable");
	expect(html).toContain('href="/ai/flows/review"');
});

test("provides the flow list destination after deletion and identifies a metadata conflict", async () => {
	const html = await render(<FlowSettingsFeedback state={deletedFlowFixture} onReturn={() => {}} />);
	expect(html).toContain('href="/ai/flows"');
	expect(html).toContain("Your edits remain in this form.");
	const conflict = renderToStaticMarkup(<FlowSettingsFeedback state={metadataConflictFixture} onReturn={() => {}} />);
	expect(conflict).toContain("The server has version 3.");
});
