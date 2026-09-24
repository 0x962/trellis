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

test("leaves no machine button when every reading is normal or unavailable", () => {
	const html = renderToStaticMarkup(<MachinePressure machines={[]} usageLink={<a href="/usage">Usage</a>} />);
	expect(html).not.toContain("<button");
});

test("names the source machine and the reading unit for assistive technology", () => {
	const html = renderToStaticMarkup(<MachinePressure machines={[machine]} usageLink={<a href="/usage">Usage</a>} />);
	expect(html).toContain("CPU load on Canary-JQV57W1HPL is 4.3 per core");
	expect(html).toContain(">Machine<");
});

test("uses one danger mark in the collapsed rail", () => {
	const html = renderToStaticMarkup(
		<MachinePressure machines={[machine]} usageLink={<a href="/usage">Usage</a>} collapsed />,
	);
	expect(html).toContain("Machine pressure has high readings");
	expect(html).toContain("Machine pressure. CPU load on Canary-JQV57W1HPL is 4.3 per core");
});
