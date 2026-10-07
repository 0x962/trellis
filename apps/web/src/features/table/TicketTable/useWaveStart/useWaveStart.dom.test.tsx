import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import type { TableGroup } from "../../utils/flattenGroups";
import { waveTicket } from "../../WaveStart/components/waveFixture";
import { useWaveStart } from "./useWaveStart";

const domTest = test.skipIf(typeof document === "undefined");
let dispose = async () => {};
afterEach(async () => dispose());

const groups: readonly TableGroup[] = [
	{ key: "wave-a", label: "Wave A", rows: [waveTicket("TRL-1")], count: 1, expanded: true },
	{
		key: "wave-b",
		label: "Wave B",
		rows: [waveTicket("TRL-2"), waveTicket("TRL-3")],
		count: 2,
		expanded: true,
	},
];

const button = (label: string) =>
	Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
		(element) => element.textContent === label || element.getAttribute("aria-label") === label,
	)!;
const checkbox = (label: string) =>
	Array.from(document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')).find((element) =>
		element.parentElement!.textContent!.includes(label),
	)!;
const click = (element: HTMLElement) => act(async () => element.click());

domTest("keeps one wave state and resets it when another wave opens", async () => {
	const queryClient = new QueryClient();
	const app = {
		queryClient,
		orpc: { agentRuns: { list: { queryOptions: () => ({ queryKey: ["assigned"] }), key: () => ["agent-runs"] } } },
		client: { agentRuns: { start: async () => ({}) } },
	} as unknown as AppContext;
	function Fixture() {
		const waveStart = useWaveStart({ groups, assignment: { status: "ready", ticketIds: new Set<string>() } });
		return (
			<AppProvider value={app}>
				<button type="button" onClick={() => waveStart.onStartGroup?.(groups[0]!)}>
					Open A
				</button>
				<button type="button" onClick={() => waveStart.onStartGroup?.(groups[1]!)}>
					Open B
				</button>
				{waveStart.dialog}
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

	await click(button("Open A"));
	await click(checkbox("TRL-1"));
	expect(button("Start 0 agents").disabled).toBe(true);
	await click(button("Cancel"));
	await click(button("Open A"));
	expect(button("Start 0 agents").disabled).toBe(true);
	await click(button("Cancel"));

	await click(button("Open B"));
	expect(button("Start 2 agents").disabled).toBe(false);
	expect(checkbox("TRL-2").getAttribute("aria-checked")).toBe("true");
	expect(checkbox("TRL-3").getAttribute("aria-checked")).toBe("true");
});
