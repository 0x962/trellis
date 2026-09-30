import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { AgentRun, AgentRunStartInput, TicketSummary } from "@trellis/api";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { waitingTicket, waveTicket } from "./components/waveFixture";
import { WaveStartDialog } from "./WaveStartDialog";

const domTest = test.skipIf(typeof document === "undefined");
let dispose = async () => {};
afterEach(async () => dispose());
const accepted = (ticket: string) => ({ id: `run-${ticket}`, ticketId: ticket, state: "starting" }) as AgentRun;

async function mount(
	tickets = [waveTicket("TRL-1"), waitingTicket("TRL-2", "TRL-1")],
	assigned = new Set<string>(),
	start: (input: AgentRunStartInput) => Promise<AgentRun> = async (input) => accepted(input.ticket!),
) {
	const calls: AgentRunStartInput[] = [];
	let setAssigned!: (ids: Set<string>) => void;
	const queryClient = new QueryClient();
	const app = {
		queryClient,
		orpc: { agentRuns: { list: { queryOptions: () => ({ queryKey: ["assigned"] }), key: () => ["agent-runs"] } } },
		client: {
			agentRuns: {
				start: async (input: AgentRunStartInput) => {
					calls.push(input);
					return start(input);
				},
			},
		},
	} as unknown as AppContext;
	function Fixture() {
		const [open, setOpen] = useState(false);
		const [held, setHeld] = useState(assigned);
		setAssigned = setHeld;
		return (
			<AppProvider value={app}>
				<button type="button" onClick={() => setOpen(true)}>
					Open wave
				</button>
				<WaveStartDialog open={open} onOpenChange={setOpen} wave="Wave 12" tickets={tickets} assigned={held} />
			</AppProvider>
		);
	}
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	dispose = async () => {
		await act(async () => root.unmount());
		container.remove();
		queryClient.clear();
	};
	await act(async () => root.render(<Fixture />));
	await click(button("Open wave"));
	return { calls, queryClient, assign: (ids: string[]) => act(async () => setAssigned(new Set(ids))) };
}

const button = (label: string) =>
	Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
		(element) => element.textContent === label || element.getAttribute("aria-label") === label,
	)!;
const checkbox = (label: string) =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')).find((element) =>
		element.parentElement!.textContent!.includes(label),
	)!;
const click = (element: HTMLElement) => act(async () => element.click());

domTest("selects only ready unassigned tickets and places a waiting ticket under its prerequisite", async () => {
	const done = waveTicket("TRL-4", {
		ready: false,
		status: { id: "done", slug: "done", name: "Done", category: "done", color: "success" },
	});
	await mount([waveTicket("TRL-1"), waitingTicket("TRL-2", "TRL-1"), waveTicket("TRL-3"), done], new Set(["TRL-3"]));
	expect(checkbox("TRL-1").getAttribute("aria-checked")).toBe("true");
	expect(checkbox("TRL-2").getAttribute("aria-checked")).toBe("false");
	expect(checkbox("TRL-3").getAttribute("aria-disabled")).toBe("true");
	expect(checkbox("TRL-4").getAttribute("aria-disabled")).toBe("true");
	expect(checkbox("TRL-2").closest("ul")?.getAttribute("aria-label")).toBe("Tickets that wait for TRL-1");
	expect(button("Start 1 agent").disabled).toBe(false);
});

domTest("keeps an explicit dependency override when the ready selection clears", async () => {
	const fixture = await mount();
	await click(checkbox("TRL-2"));
	expect(document.body.textContent).toContain("Starts anyway · Waits for TRL-1");
	await click(checkbox("Select all ready tickets"));
	expect(checkbox("TRL-2").getAttribute("aria-checked")).toBe("true");
	await click(button("Start 1 agent"));
	expect(fixture.calls.map((call) => call.ticket)).toEqual(["TRL-2"]);
});

domTest("retries only the failed ticket with its original request and harness", async () => {
	let fail = true;
	const fixture = await mount(undefined, undefined, async (input) => {
		if (input.ticket === "TRL-2" && fail)
			throw new Error("The provider refuses this start. Choose an available account.");
		return accepted(input.ticket!);
	});
	await click(checkbox("TRL-2"));
	await click(button("Start 2 agents"));
	expect(fixture.calls).toHaveLength(2);
	expect(document.querySelector('[role="alert"]')?.textContent).toContain("Choose an available account.");
	expect(button("Choose agent").disabled).toBe(true);
	expect(fixture.queryClient.getQueryData<{ items: AgentRun[] }>(["assigned"])?.items[0]?.id).toBe("run-TRL-1");
	fail = false;
	await click(button("Retry 1 ticket"));
	expect(fixture.calls).toHaveLength(3);
	expect(fixture.calls[2]).toEqual(fixture.calls[1]);
});

domTest("ignores a repeated start click while requests remain open", async () => {
	let finish!: (value: AgentRun) => void;
	const fixture = await mount(
		[waveTicket("TRL-1")],
		undefined,
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const start = button("Start 1 agent");
	await act(async () => {
		start.click();
		start.click();
	});
	expect(fixture.calls).toHaveLength(1);
	expect(button("Starting…").disabled).toBe(true);
	expect(button("Cancel").disabled).toBe(true);
	await act(async () => finish(accepted("TRL-1")));
});

domTest("removes a newly assigned ticket from the start targets before submission", async () => {
	const fixture = await mount();
	await click(checkbox("TRL-2"));
	await fixture.assign(["TRL-1"]);
	await click(button("Start 1 agent"));
	expect(fixture.calls.map((call) => call.ticket)).toEqual(["TRL-2"]);
});

domTest("allows a wave with no ready tickets to start a checked waiting ticket", async () => {
	const fixture = await mount([waitingTicket("TRL-2", "EXT-1")]);
	expect(button("Start 0 agents").disabled).toBe(true);
	expect(checkbox("Select all ready tickets").getAttribute("aria-disabled")).toBe("true");
	await click(checkbox("TRL-2"));
	await click(button("Start 1 agent"));
	expect(fixture.calls[0]?.ticket).toBe("TRL-2");
});

domTest("shows an empty wave without an agent picker or a start action", async () => {
	await mount([] as TicketSummary[]);
	expect(document.body.textContent).toContain("No tickets in this wave.");
	expect(button("Choose agent")).toBeUndefined();
	expect(button("Start 0 agents")).toBeUndefined();
});
