import { WarningCircle, XCircle } from "@phosphor-icons/react";
import { Tooltip } from "../../../../primitives/Tooltip";
import { StatusIcon } from "../../../StatusIcon";
import type { FlowRunState } from "../../types";

export const flowStateLabels: Record<FlowRunState, string> = {
	not_started: "Not started",
	pending: "Pending",
	ready: "Starting",
	running: "Running",
	waiting_human: "Needs your decision",
	unknown: "Needs attention",
	succeeded: "Succeeded",
	skipped: "Skipped",
	failed: "Failed",
	canceled: "Canceled",
};

// The state mark of a flow step. It reuses the ticket status marks where a
// state means the same thing: the empty ring before work, the filling disk
// while an agent works, the dashed ring while a person decides, the filled
// check when done, and the faint cross for a step that does not run. Failed
// is the cross filled in the danger color. A worker that needs attention is
// the filled warning sign.
export function FlowStepMark({ state }: { state: FlowRunState }) {
	const label = flowStateLabels[state];
	switch (state) {
		case "not_started":
		case "pending":
			return <StatusIcon category="todo" label={label} />;
		case "ready":
		case "running":
			return <StatusIcon category="started" label={label} />;
		case "waiting_human":
			return <StatusIcon category="review" label={label} />;
		case "succeeded":
			return <StatusIcon category="done" label={label} />;
		case "skipped":
		case "canceled":
			return <StatusIcon category="canceled" label={label} />;
		case "failed":
			return (
				<Tooltip content={label}>
					<XCircle role="img" aria-label={label} tabIndex={0} weight="fill" className="size-3.5 shrink-0 text-danger" />
				</Tooltip>
			);
		case "unknown":
			return (
				<Tooltip content={label}>
					<WarningCircle
						role="img"
						aria-label={label}
						tabIndex={0}
						weight="fill"
						className="size-3.5 shrink-0 text-warning"
					/>
				</Tooltip>
			);
	}
}
