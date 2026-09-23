import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { barSlots } from "../../../../../lib/barSlots";
import type { WaveEditing } from "../../../../table/hooks/useWaveEditing";
import { EpicTopbarActions, type EpicTopbarEpic } from "./EpicTopbarActions";

// Add tickets opens a ticket search, and the search runs only after a click
// opens the popover. The render below needs its query options and nothing
// more.
const queryClient = new QueryClient();
const app = {
	queryClient,
	orpc: {
		search: {
			query: {
				queryOptions: () => ({ queryKey: ["search.query"], queryFn: () => Promise.resolve({ items: [] }) }),
			},
		},
	},
} as unknown as AppContext;

const waveEditing = { busy: false, create: () => {}, element: null } as unknown as WaveEditing;

const openEpic: EpicTopbarEpic = {
	ref: "TRL/trellis-for-one-human-and-many-agents",
	name: "Trellis for one human and many agents",
	identifiers: ["TRL-370"],
};

const render = (epic: EpicTopbarEpic | null, readOnly = false) =>
	renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<EpicTopbarActions
					project="TRL"
					epic={epic}
					readOnly={readOnly}
					waveEditing={waveEditing}
					onAddTicket={() => {}}
					onEdit={() => {}}
					onDelete={() => {}}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

test("the bar draws its three controls before the epic arrives", () => {
	expect(barSlots(render(null))).toEqual(["new-wave", "add-tickets", "epic-actions"]);
});

test("the epic fills the bar and moves no control", () => {
	expect(barSlots(render(openEpic))).toEqual(barSlots(render(null)));
});

test("every control of the waiting bar is disabled", () => {
	const waiting = render(null);

	expect(waiting.match(/<button/g)?.length).toBe(3);
	expect(waiting.match(/ disabled=""/g)?.length).toBe(3);
	expect(render(openEpic)).not.toContain(' disabled=""');
});

test("an archived project carries the same one control in both states", () => {
	expect(barSlots(render(null, true))).toEqual(["epic-actions"]);
	expect(barSlots(render(openEpic, true))).toEqual(["epic-actions"]);
});
