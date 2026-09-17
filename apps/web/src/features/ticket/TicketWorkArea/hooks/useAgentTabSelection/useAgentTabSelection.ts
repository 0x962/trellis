import { useEffect, useRef, useState } from "react";

// One agent tab: the value the tab strip selects, and the terminal id of the
// run behind it. A URL hash of "attempt-<terminal id>" names that terminal. A
// run with no terminal has no hash and matches no hash.
export type AgentTabChoice = { value: string; run: { terminalId: string | null } };

// The selected tab of the ticket work area, and the rules that move it.
//
// The run list arrives after the first render and again on every poll, so a
// terminal hash waits for the run it names. When no assigned run carries that
// terminal id, the first agent tab opens one time for that hash, and the
// person keeps every later choice. A run that arrives in a later poll still
// opens its own tab. A tab whose run leaves the list hands the selection to
// the first agent tab.
//
// `pending` is true while the first run list is still on the way.
export function useAgentTabSelection({
	tabs,
	hash,
	pending,
}: {
	tabs: readonly AgentTabChoice[];
	hash: string;
	pending: boolean;
}) {
	const [tab, setTab] = useState("activity");
	const hashSelection = useRef({ hash: "", matched: false });
	useEffect(() => {
		if (tab === "agent" && tabs.length > 0) setTab(tabs[0]!.value);
		else if (tab.startsWith("agent:") && !tabs.some((item) => item.value === tab)) setTab(tabs[0]?.value ?? "agent");
	}, [tabs, tab]);
	useEffect(() => {
		if (!hash.startsWith("attempt-")) {
			hashSelection.current = { hash: "", matched: false };
			return;
		}
		if (pending || (hashSelection.current.hash === hash && hashSelection.current.matched)) return;
		const matching = tabs.find((item) => item.run.terminalId === hash);
		if (matching) {
			setTab(matching.value);
			hashSelection.current = { hash, matched: true };
			return;
		}
		if (hashSelection.current.hash === hash) return;
		setTab(tabs[0]?.value ?? "agent");
		hashSelection.current = { hash, matched: false };
	}, [tabs, hash, pending]);
	return { tab, setTab };
}
