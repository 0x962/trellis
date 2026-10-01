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

test.each([false, true])("hides normal and unavailable readings when collapsed=%s", (collapsed) => {
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
		<MachinePressure
			machines={[normal]}
			machinesWithAlerts={[]}
			usageLink={<a href="/usage">Usage</a>}
			collapsed={collapsed}
		/>,
	);
	expect(html).not.toContain("<button");
	expect(html).not.toContain('role="img"');
	expect(html).toContain('role="status"');
});

test.each([false, true])("hides the tab before the first sample when collapsed=%s", (collapsed) => {
	const html = renderToStaticMarkup(
		<MachinePressure
			machines={[]}
			machinesWithAlerts={[]}
			usageLink={<a href="/usage">Usage</a>}
			collapsed={collapsed}
		/>,
	);
	expect(html).not.toContain("<button");
	expect(html).not.toContain('role="img"');
});

const pressuredReadings: MachinePressureMachineView["readings"] = [
	{ key: "cpuLoad", label: "CPU load", value: "2.4", unit: "per core", tone: "warning", freshness: "live" },
	{ key: "memory", label: "Memory pressure", value: "Critical", tone: "danger", freshness: "live" },
	{ key: "temperature", label: "Processor temperature", value: "88", unit: "°C", tone: "warning", freshness: "stale" },
	{ key: "disk", label: "Disk space", value: "2.0 GiB", unit: "available", tone: "danger", freshness: "live" },
];

test.each([1, 2, 3, 4])("shows %s pressure dots with each metric's severity", (count) => {
	const alerts = { ...machine, readings: pressuredReadings.slice(0, count) };
	const html = renderToStaticMarkup(
		<MachinePressure machines={[alerts]} machinesWithAlerts={[alerts]} usageLink={<a href="/usage">Usage</a>} />,
	);
	expect(html).toContain(">Machine<");
	expect(html.match(/role="img"/g)).toHaveLength(count);
	expect(html.match(/bg-warning/g)).toHaveLength(Math.ceil(count / 2));
	expect(html.match(/bg-danger/g) ?? []).toHaveLength(Math.floor(count / 2));
	for (const reading of alerts.readings) {
		expect(html).toContain(`aria-label="${reading.label} is ${reading.tone}"`);
	}
});

test.each([
	["warning", "warning", "warning"],
	["warning", "danger", "danger"],
	["danger", "warning", "danger"],
	["danger", "danger", "danger"],
] as const)("combines temperature=%s and thermal=%s into one %s dot", (temperature, thermal, expected) => {
	const heat: MachinePressureMachineView = {
		...machine,
		readings: [
			{ ...pressuredReadings[2]!, tone: temperature },
			{ key: "thermal", label: "Thermal pressure", value: "Serious", tone: thermal, freshness: "live" },
		],
	};
	const html = renderToStaticMarkup(
		<MachinePressure machines={[heat]} machinesWithAlerts={[heat]} usageLink={<a href="/usage">Usage</a>} />,
	);
	expect(html.match(/role="img"/g)).toHaveLength(1);
	expect(html).toContain(`bg-${expected}`);
	expect(html).toContain("Processor temperature on Canary-JQV57W1HPL is 88 °C");
	expect(html).toContain("Thermal pressure on Canary-JQV57W1HPL is Serious");
});

test("keeps four dots when all five signals report pressure", () => {
	const alerts: MachinePressureMachineView = {
		...machine,
		readings: [
			...pressuredReadings,
			{ key: "thermal", label: "Thermal pressure", value: "Serious", tone: "danger", freshness: "live" },
		],
	};
	const html = renderToStaticMarkup(
		<MachinePressure machines={[alerts]} machinesWithAlerts={[alerts]} usageLink={<a href="/usage">Usage</a>} />,
	);
	expect(html.match(/role="img"/g)).toHaveLength(4);
	expect(html.match(/bg-warning/g)).toHaveLength(1);
	expect(html.match(/bg-danger/g)).toHaveLength(3);
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
