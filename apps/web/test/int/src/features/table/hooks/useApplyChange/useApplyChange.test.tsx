import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { Toaster } from "@trellis/ui";
import { useApplyChange } from "../../../../../../../src/features/table/hooks/useApplyChange/useApplyChange";
import { useTicketMutations } from "../../../../../../../src/features/table/hooks/useTicketMutations";
import { summaryOf } from "../../../../../../events";
import { renderHookWithProviders } from "../../../../../../renderHook";
import { createTestServer } from "../../../../../../server";

// The hook over the fake server, with the Toaster that shows its rollback
// toasts, and two CDE tickets as the table holds them.
const setup = async () => {
	const server = createTestServer();
	const { statuses } = await server.client.statuses.list({ project: "CDE" });
	const review = statuses.find((status) => status.slug === "agent-review")!;
	const full = await Promise.all(["CDE-42", "CDE-43"].map((ticket) => server.client.tickets.get({ ticket })));
	render(<Toaster />);
	const hook = renderHookWithProviders(() => useApplyChange(useTicketMutations(), []), undefined, {
		path: "/p/CDE",
		actor: "dana",
		server,
	});
	return { server, review, tickets: full.map((ticket) => summaryOf(ticket)), apply: hook.result.current };
};

describe("features/table/hooks/useApplyChange: the rollback toast", () => {
	// The toast reads as a sentence: the verb, the ticket, then the target.
	test("a failed move of one ticket says CDE-42 did not move to the status", async () => {
		const { server, review, tickets, apply } = await setup();
		server.failNext("tickets.update", { code: "NOT_FOUND", data: { ref: "CDE-42" } });
		await act(async () => {
			await apply([tickets[0]!], { status: review });
		});
		expect(await screen.findByText(`CDE-42 did not move to ${review.name}.`)).toBeDefined();
	});

	test("a failed move of two tickets says 2 tickets did not move to the status", async () => {
		const { server, review, tickets, apply } = await setup();
		server.failNext("tickets.updateMany", { code: "NOT_FOUND", data: { ref: "CDE-42" } });
		await act(async () => {
			await apply(tickets, { status: review });
		});
		expect(await screen.findByText(`2 tickets did not move to ${review.name}.`)).toBeDefined();
	});

	test("a failed priority change says the priority of CDE-42 did not change to High", async () => {
		const { server, tickets, apply } = await setup();
		server.failNext("tickets.update", { code: "NOT_FOUND", data: { ref: "CDE-42" } });
		await act(async () => {
			await apply([tickets[0]!], { priority: "high" });
		});
		expect(await screen.findByText("The priority of CDE-42 did not change to High.")).toBeDefined();
	});
});
