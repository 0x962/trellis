import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MachinePressure, type MachinePressureMachineView } from "./MachinePressure";

const machine: MachinePressureMachineView = {
	id: "server",
	name: "Canary-JQV57W1HPL",
	readings: [
		{
			key: "cpuLoad",
			label: "CPU load",
			value: "4.3",
			unit: "per core",
			tone: "danger",
			freshness: "live",
		},
	],
};

test("shows normal and unavailable readings without an alert mark", () => {
	const normal: MachinePressureMachineView = {
		...machine,
		readings: [
			{ ...machine.readings[0]!, value: "0.4", tone: "normal" },
			{
				key: "temperature",
				label: "Processor temperature",
				value: "Unavailable",
				tone: "normal",
				freshness: "unavailable",
			},
		],
	};
	const html = renderToStaticMarkup(
		<MachinePressure machines={[normal]} machinesWithAlerts={[]} usageLink={<a href="/usage">Usage</a>} collapsed />,
	);
	expect(html).toContain("<button");
	expect(html).toContain("Processor temperature on Canary-JQV57W1HPL is Unavailable");
	expect(html).not.toContain("Machine pressure has high readings");
});

test("names the source machine and the reading unit for assistive technology", () => {
	const html = renderToStaticMarkup(
		<MachinePressure machines={[machine]} machinesWithAlerts={[machine]} usageLink={<a href="/usage">Usage</a>} />,
	);
	expect(html).toContain("CPU load on Canary-JQV57W1HPL is 4.3 per core");
	expect(html).toContain(">Machine<");
});

test("uses one danger mark in the collapsed rail", () => {
	const html = renderToStaticMarkup(
		<MachinePressure
			machines={[machine]}
			machinesWithAlerts={[machine]}
			usageLink={<a href="/usage">Usage</a>}
			collapsed
		/>,
	);
	expect(html).toContain("Machine pressure has high readings");
	expect(html).toContain("Machine readings. CPU load on Canary-JQV57W1HPL is 4.3 per core");
});
