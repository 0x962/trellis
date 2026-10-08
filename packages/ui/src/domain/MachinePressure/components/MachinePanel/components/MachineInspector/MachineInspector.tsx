import { type ReactNode, useState } from "react";
import { Tabs } from "../../../../../../primitives/Tabs";
import { MachineRuns } from "../../../../../MachineRuns";
import type { MachinePressureMachineView } from "../../../../MachinePressure";
import { MachineDetails } from "./components/MachineDetails";
import { MachineOverview } from "./components/MachineOverview";

export function MachineInspector({
	machine,
	usageLink,
}: {
	machine: MachinePressureMachineView;
	usageLink?: ReactNode;
}) {
	const [tab, setTab] = useState<"overview" | "runs" | "details">("overview");
	return (
		<section aria-label={machine.name}>
			<div className="px-5 max-sm:px-3">
				<p className="mb-4 break-words text-sm text-fg-muted">{machine.name}</p>
				<Tabs
					value={tab}
					onValueChange={setTab}
					panelClassName="h-80 overflow-y-auto overscroll-contain py-4"
					items={[
						{ value: "overview", label: "Overview", content: <MachineOverview readings={machine.readings} /> },
						{ value: "runs", label: "Runs", content: <MachineRuns runs={machine.runs} /> },
						{ value: "details", label: "Details", content: <MachineDetails readings={machine.readings} /> },
					]}
				/>
			</div>
			<footer className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 border-t border-border px-5 text-sm max-sm:px-3 [&_a]:inline-flex [&_a]:min-h-7 pointer-coarse:[&_a]:min-h-11 [&_a]:items-center">
				<p className="py-2 text-xs text-fg-faint tabular">{machine.ageText}</p>
				{usageLink}
			</footer>
		</section>
	);
}
