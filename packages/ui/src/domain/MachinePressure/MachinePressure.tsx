import { Cpu } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { AttentionDot } from "../../primitives/AttentionDot";
import { Popover } from "../../primitives/Popover";
import { cx } from "../../utils/cx";

export type MachinePressureReadingView = {
	key: string;
	label: string;
	value: string;
	unit?: string;
	tone: "normal" | "warning" | "danger";
	freshness: "live" | "stale" | "unavailable" | "lost";
	detail?: string;
};

export type MachinePressureMachineView = {
	id: string;
	name: string;
	readings: MachinePressureReadingView[];
	details?: MachinePressureReadingView[];
	runs?: string[];
	ageText?: string;
};

export type MachinePressureProps = {
	machines: MachinePressureMachineView[];
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

function PressureDots({ machines, collapsed }: { machines: MachinePressureMachineView[]; collapsed: boolean }) {
	if (collapsed) {
		return (
			<span className="absolute -right-0.5 -top-0.5 inline-flex">
				<AttentionDot
					label="Machine pressure has high readings"
					tone={toneOf(machines)}
					tooltip={false}
					focusable={false}
				/>
			</span>
		);
	}
	return (
		<span className="sidebar-trailing min-w-10 gap-1 pointer-coarse:min-w-15" aria-hidden="true">
			{machines.flatMap((machine) =>
				machine.readings.map((reading) => (
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

function MachinePanel({ machines, usageLink }: Pick<MachinePressureProps, "machines" | "usageLink">) {
	return (
		<div className="w-80 max-w-full">
			{machines.map((machine, index) => (
				<section key={machine.id} className={cx("p-3", index > 0 && "border-border border-t")}>
					<p className="truncate text-xs text-fg-muted uppercase tracking-wide">Machine · {machine.name}</p>
					<dl className="mt-3 flex flex-col gap-2">
						{[...machine.readings, ...(machine.details ?? [])].map((reading) => (
							<div key={reading.key}>
								<div className="flex min-w-0 items-baseline gap-3 text-sm">
									<dt className="min-w-0 flex-1 text-fg">{reading.label}</dt>
									<dd
										className={cx(
											"shrink-0 text-right font-medium tabular",
											reading.tone === "danger"
												? "text-danger"
												: reading.tone === "warning"
													? "text-warning"
													: "text-fg-muted",
										)}
									>
										{reading.value}
										{reading.unit && <span className="font-normal text-fg-faint"> {reading.unit}</span>}
									</dd>
								</div>
								{reading.freshness === "stale" && <p className="text-xs text-fg-muted">Stale reading</p>}
								{reading.detail && <p className="mt-1 break-words text-xs text-fg-faint">{reading.detail}</p>}
							</div>
						))}
					</dl>
					{((machine.runs && machine.runs.length > 0) || machine.ageText) && (
						<div className="mt-3 border-border border-t pt-3 text-xs text-fg-muted">
							{machine.runs && machine.runs.length > 0 && <p>Heaviest runs: {machine.runs.join(", ")}.</p>}
							{machine.ageText && <p>{machine.ageText}</p>}
						</div>
					)}
				</section>
			))}
			<div className="px-3 pb-3 text-xs text-fg-muted">{usageLink}</div>
		</div>
	);
}

export function MachinePressure({ machines, usageLink, collapsed = false, open, onOpenChange }: MachinePressureProps) {
	const active = machines.filter((machine) => machine.readings.length > 0);
	const announcement = announcementOf(active);
	if (active.length === 0) return <span role="status" aria-live="polite" className="sr-only" />;
	const trigger = (
		<button
			type="button"
			aria-label={collapsed ? `Machine pressure. ${announcement}` : undefined}
			className={cx(
				"text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
				collapsed ? "sidebar-rail-row relative" : "sidebar-row w-full pl-2 text-sm",
			)}
		>
			<span data-slot="leading" className={collapsed ? "relative inline-flex" : "sidebar-leading"}>
				<Cpu size={16} aria-hidden="true" />
				{collapsed && <PressureDots machines={active} collapsed />}
			</span>
			{!collapsed && (
				<>
					<span data-slot="label" className="sidebar-label text-left">
						Machine
					</span>
					<PressureDots machines={active} collapsed={false} />
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
				className="max-w-(--available-width) p-0"
				open={open}
				onOpenChange={onOpenChange}
			>
				<MachinePanel machines={active} usageLink={usageLink} />
			</Popover>
		</>
	);
}
