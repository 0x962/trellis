import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useAgentTabSelection } from "./useAgentTabSelection";

const tab = (id: string) => ({ value: `agent:${id}`, run: { terminalId: `attempt-${id}` } });

const first = tab("one");
const second = tab("two");

const start = (props: { tabs: { value: string; run: { terminalId: string } }[]; hash: string; pending: boolean }) =>
	renderHook((current: typeof props) => useAgentTabSelection(current), { initialProps: props });

describe("features/ticket/TicketWorkArea/hooks/useAgentTabSelection", () => {
	test("opens the activity tab when the URL carries no terminal hash", () => {
		const { result } = start({ tabs: [first], hash: "", pending: false });
		expect(result.current.tab).toBe("activity");
	});

	test("opens the tab of the run that a later poll brings in", () => {
		const view = start({ tabs: [], hash: "attempt-two", pending: true });
		view.rerender({ tabs: [first], hash: "attempt-two", pending: false });
		expect(view.result.current.tab).toBe("agent:one");
		view.rerender({ tabs: [first, second], hash: "attempt-two", pending: false });
		expect(view.result.current.tab).toBe("agent:two");
	});

	// Each poll gives a new array. A hash that no assigned run carries must not
	// pull the selection back to the first agent on every one of those polls.
	test("keeps a chosen tab while a terminal hash matches no assigned run", () => {
		const view = start({ tabs: [first], hash: "attempt-gone", pending: false });
		expect(view.result.current.tab).toBe("agent:one");
		act(() => view.result.current.setTab("changes"));
		view.rerender({ tabs: [{ ...first }], hash: "attempt-gone", pending: false });
		expect(view.result.current.tab).toBe("changes");
	});

	test("moves to the first agent tab when the selected run leaves the list", () => {
		const view = start({ tabs: [first, second], hash: "attempt-two", pending: false });
		expect(view.result.current.tab).toBe("agent:two");
		view.rerender({ tabs: [first], hash: "attempt-two", pending: false });
		expect(view.result.current.tab).toBe("agent:one");
	});
});
