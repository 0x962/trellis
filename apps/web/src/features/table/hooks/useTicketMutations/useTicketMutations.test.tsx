import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ListOutput, Status, TicketDeleteManyInput, TicketSummary, TicketUpdateManyInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { ulid } from "ulid";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import { type TicketMutations, useTicketMutations } from "./useTicketMutations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = {
	id: ulid(),
	projectId: ulid(),
	name: "Todo",
	slug: "todo",
	category: "todo",
	color: "accent",
	description: "",
	position: 0,
	isDefault: true,
	createdAt: "2026-09-29T00:00:00.000Z",
	updatedAt: "2026-09-29T00:00:00.000Z",
} satisfies Status;

const ticket = (ticketNumber: number, prefix = "TRL"): TicketSummary => ({
	id: ulid(),
	identifier: `${prefix}-${ticketNumber}`,
	number: ticketNumber,
	title: `Ticket ${ticketNumber}`,
	priority: "none",
	status,
	project: { id: status.projectId, key: "TRL" },
	parent: null,
	ancestors: [],
	epic: null,
	wave: null,
	childCount: 0,
	childDoneCount: 0,
	attachmentCount: 0,
	labels: [],
	waitsOn: [],
	releases: [],
	ready: false,
	pr: null,
	prRows: [],
	lastActor: null,
	position: ticketNumber,
	version: 1,
	createdAt: "2026-09-29T00:00:00.000Z",
	updatedAt: "2026-09-29T00:00:00.000Z",
	completedAt: null,
});

for (const operation of ["updateMany", "removeMany"] as const) {
	for (const fails of [false, true]) {
		test(`${operation} sends all 201 rows once and ${fails ? "keeps every original row on failure" : "applies every result"}`, async () => {
			const originals = Array.from({ length: 201 }, (_, index) => ticket(index + 1));
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
			const key = [["tickets", "list"], { input: {}, type: "query" }];
			queryClient.setQueryData(key, { items: originals, nextCursor: null });
			const requests: (TicketUpdateManyInput | TicketDeleteManyInput)[] = [];
			const app = {
				queryClient,
				orpc: {
					projects: {
						list: {
							queryOptions: () => ({
								queryKey: ["archived-projects"],
								queryFn: async () => [],
							}),
						},
					},
				},
				client: {
					tickets: {
						updateMany: async (input: TicketUpdateManyInput) => {
							requests.push(input);
							expect(
								queryClient.getQueryData<ListOutput>(key)?.items.every((row) => row.priority === "high"),
							).toBeTrue();
							if (fails) throw new Error("The last ticket is unavailable.");
							return { items: originals.map((row) => ({ ...row, priority: "high", version: 2 })) };
						},
						deleteMany: async (input: TicketDeleteManyInput) => {
							requests.push(input);
							if (fails) throw new Error("The last ticket is unavailable.");
							return { deleted: input.tickets };
						},
					},
				},
			} as unknown as AppContext;
			let mutations: TicketMutations;
			const Probe = () => {
				mutations = useTicketMutations();
				return null;
			};
			const renderer = createRoot();
			try {
				await act(async () =>
					renderer.render(
						<QueryClientProvider client={queryClient}>
							<AppProvider value={app}>
								<Probe />
							</AppProvider>
						</QueryClientProvider>,
					),
				);
				await act(async () => {
					if (operation === "updateMany") {
						await mutations.updateMany(
							originals,
							{ priority: "high" },
							{ priority: "high" },
							(subject) => `${subject} did not change.`,
						);
					} else await mutations.removeMany(originals);
				});
				expect(requests).toHaveLength(1);
				expect(requests[0]?.tickets).toEqual(originals.map((row) => row.identifier));
				const saved = queryClient.getQueryData<ListOutput>(key)!.items;
				if (fails) expect(saved).toEqual(originals);
				else if (operation === "removeMany") expect(saved).toHaveLength(0);
				else {
					expect(saved).toHaveLength(201);
					expect(saved.every((row) => row.priority === "high" && row.version === 2)).toBeTrue();
				}
			} finally {
				await act(async () => renderer.unmount());
				queryClient.clear();
			}
		});
	}
}
