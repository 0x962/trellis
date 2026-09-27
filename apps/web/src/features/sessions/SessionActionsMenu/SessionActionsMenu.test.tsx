import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentRun, Session } from "@trellis/api";
import type { MenuItem } from "@trellis/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { SessionActionsMenu, type SessionActionsMenuProps } from "./SessionActionsMenu";

const pinnedAt = "2026-09-27T12:00:00.000Z";
const run = (pin: string | null) => ({ id: "ticket-agent", name: "Agent", pinnedAt: pin }) as AgentRun;
const session = (pin: string | null) =>
	({ id: "session", runId: "session-agent", name: "Session", pinnedAt: pin, archivedAt: null }) as Session;

async function checkPinAction(props: SessionActionsMenuProps, label: string, id: string, pinned: boolean) {
	const queryClient = new QueryClient();
	const request = Promise.withResolvers<{ id: string; pinned: boolean }>();
	const app = {
		queryClient,
		client: {
			agentRuns: {
				setPinned: async (input: { id: string; pinned: boolean }) => {
					request.resolve(input);
					return { id: input.id, pinnedAt: input.pinned ? pinnedAt : null };
				},
			},
		},
		orpc: { sessions: { key: () => ["sessions"] }, agentRuns: { key: () => ["agentRuns"] } },
	} as unknown as AppContext;
	let items: MenuItem[] = [];
	function ReadMenu() {
		const element = SessionActionsMenu(props);
		items = element.props.children[0].props.items;
		return null;
	}
	renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={app}>
				<ReadMenu />
			</AppProvider>
		</QueryClientProvider>,
	);
	const action = items.find((item) => item.label === "Pin" || item.label === "Unpin")!;
	expect(action.label).toBe(label);
	action.onSelect();
	expect(await request.promise).toEqual({ id, pinned });
	queryClient.clear();
}

test("an unpinned ticket agent offers Pin and saves a pin", () =>
	checkPinAction({ run: run(null) }, "Pin", "ticket-agent", true));

test("a pinned ticket agent offers Unpin and removes the pin", () =>
	checkPinAction({ run: run(pinnedAt) }, "Unpin", "ticket-agent", false));

test("a standalone session uses its own pin state and agent ID", async () => {
	await checkPinAction({ session: session(null) }, "Pin", "session-agent", true);
	await checkPinAction({ session: session(pinnedAt) }, "Unpin", "session-agent", false);
});

test("the action uses the run pin state when both records are present", () =>
	checkPinAction({ run: run(null), session: session(pinnedAt) }, "Pin", "ticket-agent", true));
