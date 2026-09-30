import type { ReactNode } from "react";
import { PickerButton } from "../../primitives/PickerButton";
import { Popover } from "../../primitives/Popover";
import "./agentLaunchPicker.css";

export function AgentLaunchPicker({
	agent,
	model,
	icon,
	disabled,
	children,
}: {
	agent: string;
	model: string;
	icon: ReactNode;
	disabled: boolean;
	children: ReactNode;
}) {
	return (
		<Popover
			label="Choose agent"
			side="top"
			align="start"
			className="agent-launch-popover"
			trigger={
				<PickerButton label="Choose agent" disabled={disabled} className="agent-launch-trigger">
					<span className="agent-launch-value">
						<span className="inline-flex size-4 shrink-0 items-center justify-center">{icon}</span>
						<span className="shrink-0 font-medium">{agent}</span>
						<span className="min-w-0 truncate text-fg-muted">{model}</span>
					</span>
				</PickerButton>
			}
		>
			<div className="mb-4 flex flex-col gap-1">
				<h3 className="text-md font-medium">Choose agent</h3>
				<p className="text-sm text-fg-muted">Use for all checked tickets</p>
			</div>
			<div className="agent-launch-fields">{children}</div>
		</Popover>
	);
}
