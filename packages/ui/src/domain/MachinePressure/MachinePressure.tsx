import { Cpu } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { AttentionDot } from "../../primitives/AttentionDot";
import { Popover } from "../../primitives/Popover";
import { cx } from "../../utils/cx";
import { MachinePanel } from "./components/MachinePanel";

export type MachinePressureReadingView = {
	key: string;
	label: string;
	value: string;
	unit?: string;
	tone: "normal" | "warning" | "danger";
	freshness: "live" | "stale" | "unavailable" | "lost";
	details?: { label: string; value: string }[];
	capacity?: { total: string; usedPercent: number };
};

export type MachinePressureMachineView = {
	id: string;
	name: string;
	readings: MachinePressureReadingView[];
	runs?: { id: string; label: string; memory: string }[];
	ageText?: string;
};

export type MachinePressureProps = {
	machines: MachinePressureMachineView[];
	machinesWithAlerts: MachinePressureMachineView[];
	usageLink: ReactNode;
	collapsed?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

const toneOf = (machines: MachinePressureMachineView[]) =>
	machines.some((machine) => machine.readings.some((reading) => reading.tone === "danger")) ? "danger" : "warning";

const readingText = (reading: MachinePressureReadingView) =>
	`${reading.value}${reading.unit ? ` ${reading.unit}` : ""}`;

const announcementOf = (machines: MachinePressureMachineView[]) =>
	machines
		.flatMap((machine) =>
			machine.readings.map((reading) => `${reading.label} on ${machine.name} is ${readingText(reading)}`),
		)
		.join(". ");

const dotReadings = (readings: MachinePressureReadingView[]) => {
	const thermal = readings.find((reading) => reading.key === "thermal");
	const temperature = readings.find((reading) => reading.key === "temperature");
	const heat = thermal?.tone === "danger" ? thermal : (temperature ?? thermal);
	return readings.filter((reading) => (reading.key !== "thermal" && reading.key !== "temperature") || reading === heat);
};

function PressureDots({
	machinesWithAlerts,
	collapsed,
}: {
	machinesWithAlerts: MachinePressureMachineView[];
	collapsed: boolean;
}) {
	if (machinesWithAlerts.length === 0) return null;
	if (collapsed) {
		return (
			<span className="absolute -right-0.5 -top-0.5 inline-flex">
				<AttentionDot
					label="Machine pressure has high readings"
					tone={toneOf(machinesWithAlerts)}
					tooltip={false}
					focusable={false}
				/>
			</span>
		);
	}
	return (
		<span className="sidebar-trailing min-w-10 gap-1 pointer-coarse:min-w-15" aria-hidden="true">
			{machinesWithAlerts.flatMap((machine) =>
				dotReadings(machine.readings).map((reading) => (
					<AttentionDot
						key={`${machine.id}:${reading.key}`}
						label={`${reading.label} is ${reading.tone}`}
						tone={reading.tone === "danger" ? "danger" : "warning"}
						tooltip={false}
						focusable={false}
					/>
				)),
			)}
		</span>
	);
}

export function MachinePressure({
	machines,
	machinesWithAlerts,
	usageLink,
	collapsed = false,
	open,
	onOpenChange,
}: MachinePressureProps) {
	const announcement = announcementOf(machinesWithAlerts);
	const description = announcementOf(machines);
	if (machinesWithAlerts.length === 0) return <span role="status" aria-live="polite" className="sr-only" />;
	const trigger = (
		<button
			type="button"
			aria-label={collapsed ? `Machine readings. ${description}` : undefined}
			className={cx(
				"text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
				collapsed ? "sidebar-rail-row relative" : "sidebar-row w-full pl-2 text-sm",
			)}
		>
			<span data-slot="leading" className={collapsed ? "relative inline-flex" : "sidebar-leading"}>
				<Cpu size={16} aria-hidden="true" />
				{collapsed && <PressureDots machinesWithAlerts={machinesWithAlerts} collapsed />}
			</span>
			{!collapsed && (
				<>
					<span data-slot="label" className="sidebar-label text-left">
						Machine
					</span>
					<PressureDots machinesWithAlerts={machinesWithAlerts} collapsed={false} />
				</>
			)}
		</button>
	);
	return (
		<>
			<span role="status" aria-live="polite" className="sr-only">
				{announcement}
			</span>
			<Popover
				trigger={trigger}
				triggerTooltip={collapsed ? "Machine pressure" : undefined}
				label="Machine pressure details"
				side="right"
				align="start"
				className="max-h-(--available-height) max-w-(--available-width) overflow-y-auto p-0!"
				open={open}
				onOpenChange={onOpenChange}
			>
				<MachinePanel machines={machines} usageLink={usageLink} />
			</Popover>
		</>
	);
}
