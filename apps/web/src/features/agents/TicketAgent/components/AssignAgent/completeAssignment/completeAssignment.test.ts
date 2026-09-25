import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import type { AgentRun } from "@trellis/api";
import { pageSheetActions, usePageSheetStore } from "../../../../../../stores/pageSheetStore";
import { completeAssignment } from "./completeAssignment";

const ticketRuns = ["agentRuns", "list", { ticket: "TRL-481" }] as const;
const assignedRuns = ["agentRuns", "list", { assigned: true }] as const;

const run = (state: AgentRun["state"]) =>
	({
		id: "01M3D44FN14DF237AS31NW4WFK",
		ticketId: "01M3D42PMZ02RM1GWX3D9812PE",
		state,
	}) as AgentRun;

test("a first assignment keeps the epic route and the ticket sheet", () => {
	const history = createMemoryHistory({
		initialEntries: ["/p/TRL/epics/trellis-for-one-human-and-many-agents?group=status#assignment"],
	});
	const route = history.location;
	const page = { scrollTop: 720, expanded: ["assignment-behavior"], selected: ["TRL-481"] };
	const queryClient = new QueryClient();
	queryClient.setQueryData(ticketRuns, []);
	queryClient.setQueryData(assignedRuns, []);
	pageSheetActions.openTicket("TRL-481");
	let remembered = false;
	let cleared = false;
	let invalidated = false;

	completeAssignment({
		queryClient,
		queryKeys: [ticketRuns, assignedRuns],
		run: run("starting"),
		rememberChoice: () => {
			remembered = true;
		},
		clearStart: () => {
			cleared = true;
		},
		invalidateRuns: () => {
			invalidated = true;
		},
	});

	expect(history.location).toEqual(route);
	expect(page).toEqual({ scrollTop: 720, expanded: ["assignment-behavior"], selected: ["TRL-481"] });
	expect(usePageSheetStore.getState().ticket).toBe("TRL-481");
	expect(queryClient.getQueryData<AgentRun[]>(ticketRuns)).toEqual([run("starting")]);
	expect(queryClient.getQueryData<AgentRun[]>(assignedRuns)).toEqual([run("starting")]);
	expect({ remembered, cleared, invalidated }).toEqual({ remembered: true, cleared: true, invalidated: true });

	pageSheetActions.closeTicket();
});

test("a retry keeps the ticket route and replaces the cached run", () => {
	const history = createMemoryHistory({ initialEntries: ["/t/TRL-481#agent"] });
	const route = history.location;
	const queryClient = new QueryClient();
	queryClient.setQueryData(ticketRuns, [run("failed")]);
	queryClient.setQueryData(assignedRuns, [run("failed")]);

	completeAssignment({
		queryClient,
		queryKeys: [ticketRuns, assignedRuns],
		run: run("starting"),
		rememberChoice: () => {},
		clearStart: () => {},
		invalidateRuns: () => {},
	});

	expect(history.location).toEqual(route);
	expect(queryClient.getQueryData<AgentRun[]>(ticketRuns)).toEqual([run("starting")]);
	expect(queryClient.getQueryData<AgentRun[]>(assignedRuns)).toEqual([run("starting")]);
});
