import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MachineRuns } from "../../../../../MachineRuns";
import type { MachinePressureReadingView } from "../../../../MachinePressure";
import { MachineDetails } from "./components/MachineDetails";
import { MachineOverview } from "./components/MachineOverview";

const readings: MachinePressureReadingView[] = [
	{ key: "thermal", label: "Thermal pressure", value: "Nominal", tone: "normal", freshness: "stale" },
	{
		key: "temperature",
		label: "Processor temperature",
		value: "60",
		unit: "°C",
		tone: "normal",
		freshness: "stale",
		details: [{ label: "Temperature sensor", value: "PMU tdie6" }],
	},
	{
		key: "disk",
		label: "Disk space",
		value: "2.0 GiB",
		unit: "available",
		tone: "danger",
		freshness: "live",
		capacity: { total: "100.0 GiB", usedPercent: 98 },
		details: [{ label: "Measured path", value: "/remote/agents" }],
	},
];

test("keeps stale and critical readings explicit and exposes disk usage as a meter", () => {
	const html = renderToStaticMarkup(<MachineOverview readings={readings} />);
	expect(html).toContain("Stale reading");
	expect(html).toContain("Critically low space");
	expect(html).toContain('aria-label="Disk space used"');
	expect(html).toContain('value="98"');
	expect(html).toContain("98.0% used");
	expect(html.indexOf("Processor temperature")).toBeLessThan(html.indexOf("Thermal pressure"));
	expect(html).not.toContain("PMU tdie6");
	expect(html).not.toContain("/remote/agents");
});

test("keeps unavailable disk capacity unknown", () => {
	const html = renderToStaticMarkup(
		<MachineOverview
			readings={[{ key: "disk", label: "Disk space", value: "Unavailable", tone: "normal", freshness: "lost" }]}
		/>,
	);
	expect(html).toContain("Reading lost");
	expect(html).not.toContain("<meter");
	expect(html).not.toContain("% used");
});

test("retains sensor and measured path information in Details", () => {
	const html = renderToStaticMarkup(<MachineDetails readings={readings} />);
	expect(html).toContain("Temperature sensor");
	expect(html).toContain("PMU tdie6");
	expect(html).toContain("Measured path");
	expect(html).toContain("/remote/agents");
	expect(html).toContain("CPU load is the system load per core");
});

test("keeps every run visible when two agents share one ticket", () => {
	const html = renderToStaticMarkup(
		<MachineRuns
			runs={[
				{ id: "first", label: "TRL-1265", memory: "12 GB" },
				{ id: "second", label: "TRL-1265", memory: "512 MB" },
				{ id: "session", label: "Investigate machine readings", memory: "128 MB" },
			]}
		/>,
	);
	expect(html.match(/TRL-1265/g)).toHaveLength(2);
	expect(html).toContain("12 GB");
	expect(html).toContain("512 MB");
	expect(html).toContain("Investigate machine readings");
	expect(renderToStaticMarkup(<MachineRuns runs={[]} />)).toContain("No active runs");
});
