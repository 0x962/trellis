import { describe, expect, test } from "bun:test";
import { generateOperationKey } from "@orpc/tanstack-query";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { type AgentRun, createEventApplier } from "@trellis/api";
import type { LinkPress, SessionUpdates } from "@trellis/ui";
import type { Orpc } from "../../../../../lib/orpc";
import {
	agentStatusLinkPress,
	agentStatusUpdatesQueryOptions,
	sessionStatusProcessState,
	sessionUpdateInput,
} from "./agentStatusUpdatesState";

const run = (fields: Partial<AgentRun> = {}) =>
	({
		id: "01M3NTSQFE0SNHV14Q5YNX8M2T",
		name: "Agent",
		runtime: "native",
		harness: null,
		kind: "agent",
		projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
		projectKey: "TRL",
		ticketId: "01M3NTSQFE0SNHV14Q5YNX8M2T",
		ticketIdentifier: "TRL-655",
		ticketTitle: "Show saved agent updates in every session",
		ticketStatusCategory: "started",
		pinnedAt: null,
		assigned: true,
		state: "running",
		processStatus: "running",
		observation: null,
		workspaceId: "workspace",
		terminalId: "attempt",
		url: null,
		error: null,
		sessionId: "provider-session",
		sessionLost: false,
		activityAt: "2026-09-29T06:00:00.000Z",
		createdAt: "2026-09-29T05:00:00.000Z",
		updatedAt: "2026-09-29T06:00:00.000Z",
		...fields,
	}) as AgentRun;

describe("session status state", () => {
	test("uses the run identity for ticket and standalone update queries", () => {
		expect(sessionUpdateInput(run({ id: "ticket-run", kind: "agent" }))).toEqual({ sessionId: "ticket-run" });
		expect(sessionUpdateInput(run({ id: "standalone-run", kind: "session" }))).toEqual({ sessionId: "standalone-run" });
	});

	test("keeps completed work distinct from active and paused work", () => {
		expect(sessionStatusProcessState(run())).toBe("active");
		expect(sessionStatusProcessState(run({ state: "starting", processStatus: null }))).toBe("active");
		expect(sessionStatusProcessState(run({ processStatus: "exited" }))).toBe("paused");
		expect(sessionStatusProcessState(run({ ticketStatusCategory: "done" }))).toBe("completed");
		expect(
			sessionStatusProcessState(
				run({
					observation: {
						checkedAt: "now",
						controllable: false,
						activity: null,
						lastMessage: null,
						lastTool: null,
						outcome: "completed",
						turnId: null,
					},
				}),
			),
		).toBe("completed");
	});

	test("preserves the actual link modifiers for every target", () => {
		const press: LinkPress = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };
		expect(agentStatusLinkPress("_blank", press)).toBe(press);
		expect(agentStatusLinkPress("", press)).toBe(press);
		const commandPress = { ...press, metaKey: true };
		expect(agentStatusLinkPress("_blank", commandPress)).toBe(commandPress);
	});

	test("switches the selected run and refreshes its update after an event", async () => {
		const firstRunId = "01M3NTSQFE0SNHV14Q5YNX8M2T";
		const secondRunId = "01M3NVQ8K3ZBWDFDZ406A4M1D9";
		const updates = new Map<string, SessionUpdates>([
			[firstRunId, sessionUpdates(firstRunId, "Update A")],
			[secondRunId, sessionUpdates(secondRunId, "Update B")],
		]);
		const orpc = {
			sessionUpdates: {
				get: {
					infiniteOptions: ({ input }: { input: (cursor: undefined) => { sessionId: string } }) => ({
						queryKey: generateOperationKey(["sessionUpdates", "get"], { input: input(undefined) }),
						queryFn: async () => updates.get(input(undefined).sessionId)!,
						initialPageParam: undefined,
						getNextPageParam: () => undefined,
					}),
				},
			},
		} as unknown as Orpc;
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		const observer = new InfiniteQueryObserver(
			queryClient,
			agentStatusUpdatesQueryOptions(orpc, run({ id: firstRunId })),
		);
		const unsubscribe = observer.subscribe(() => {});

		await observer.refetch();
		expect(observer.getCurrentResult().data?.pages[0]?.latest?.body).toBe("Update A");
		observer.setOptions(agentStatusUpdatesQueryOptions(orpc, run({ id: secondRunId })));
		await observer.refetch();
		expect(observer.getCurrentResult().data?.pages[0]?.latest?.body).toBe("Update B");

		let flush = () => {};
		const applier = createEventApplier(queryClient, {
			scheduler: {
				now: () => 0,
				setTimeout: (callback) => {
					flush = callback;
					return 1;
				},
				clearTimeout: () => {},
			},
		});
		updates.set(secondRunId, sessionUpdates(secondRunId, "Update B after the event"));
		applier.applyEvent({ type: "session-updates.changed", id: secondRunId });
		flush();
		await Bun.sleep(1);
		expect(observer.getCurrentResult().data?.pages[0]?.latest?.body).toBe("Update B after the event");

		unsubscribe();
		queryClient.clear();
	});
});

const sessionUpdates = (runId: string, body: string): SessionUpdates => ({
	latest: {
		id: `update-${runId}`,
		sessionId: null,
		runId,
		requestId: null,
		body,
		embeds: [],
		createdAt: "2026-09-29T06:00:00.000Z",
	},
	previous: null,
	request: null,
});
