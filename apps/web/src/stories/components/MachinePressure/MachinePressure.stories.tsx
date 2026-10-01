import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MachinePressureMachineView } from "@trellis/ui";
import { MachinePressure } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const machine: MachinePressureMachineView = {
	id: "local",
	name: "Local workstation",
	readings: [
		{
			key: "disk",
			label: "Disk space",
			value: "2.0 GiB",
			unit: "available",
			tone: "danger",
			freshness: "live",
			capacity: { total: "512 GiB", usedPercent: 99.5 },
			details: [{ label: "Measured path", value: "/workspace/trellis" }],
		},
	],
	runs: [{ id: "run-1", label: "Review agent", memory: "1.2 GiB" }],
	ageText: "Last read 2 s ago.",
};
const reading = machine.readings[0]!;
const meta = {
	title: "Components/MachinePressure",
	component: MachinePressure,
	args: { machines: [machine], machinesWithAlerts: [machine], usageLink: <a href="#usage">Open Usage</a> },
	parameters: {
		docs: {
			description: {
				component:
					"Open the machine panel, then inspect a reading or an agent. The values are synthetic and remain fixed.",
			},
		},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		return (
			<div className="w-64">
				<MachinePressure {...args} open={open} onOpenChange={setOpen} />
			</div>
		);
	},
} satisfies Meta<typeof MachinePressure>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Collapsed: Story = { args: { collapsed: true } };
export const Empty: Story = { args: { machines: [], machinesWithAlerts: [] } };
export const Normal: Story = {
	args: {
		machines: [
			{
				...machine,
				readings: [{ ...reading, value: "120 GiB", tone: "normal", capacity: { total: "512 GiB", usedPercent: 76 } }],
			},
		],
		machinesWithAlerts: [],
	},
};
export const Warning: Story = {
	args: {
		machines: [{ ...machine, readings: [{ ...reading, value: "8 GiB", tone: "warning" }] }],
		machinesWithAlerts: [{ ...machine, readings: [{ ...reading, value: "8 GiB", tone: "warning" }] }],
	},
};
export const Stale: Story = {
	args: { machines: [{ ...machine, ageText: "Last read 34 s ago.", readings: [{ ...reading, freshness: "stale" }] }] },
};
export const Unavailable: Story = {
	args: {
		machines: [
			{
				...machine,
				readings: [
					{
						...reading,
						value: "Unavailable",
						unit: undefined,
						capacity: undefined,
						tone: "normal",
						freshness: "unavailable",
					},
				],
			},
		],
		machinesWithAlerts: [],
	},
};
export const Lost: Story = {
	args: {
		machines: [
			{
				...machine,
				readings: [
					{ ...reading, value: "Unavailable", unit: undefined, capacity: undefined, tone: "normal", freshness: "lost" },
				],
			},
		],
		machinesWithAlerts: [],
	},
};
export const AllSignals: Story = {
	args: {
		machines: [
			{
				...machine,
				readings: [
					reading,
					{ key: "cpuLoad", label: "CPU load", value: "4.3", unit: "per core", tone: "danger", freshness: "live" },
					{ key: "memory", label: "Memory pressure", value: "Critical", tone: "danger", freshness: "live" },
					{ key: "thermal", label: "Thermal pressure", value: "Serious", tone: "danger", freshness: "live" },
					{
						key: "temperature",
						label: "Processor temperature",
						value: "97",
						unit: "°C",
						tone: "danger",
						freshness: "live",
					},
				],
			},
		],
		open: true,
	},
};
