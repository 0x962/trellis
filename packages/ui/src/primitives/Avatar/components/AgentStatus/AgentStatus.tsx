import { cx } from "../../../../utils/cx";

export type AgentStatusValue =
	| "starting"
	| "working"
	| "needs-input"
	| "done"
	| "idle"
	| "failed"
	| "interrupted"
	| "stopped"
	| "unavailable";
const colors: Record<AgentStatusValue, string> = {
	starting: "bg-fg-muted",
	working: "bg-warning motion-safe:animate-pulse",
	"needs-input": "bg-warning",
	done: "bg-success",
	idle: "bg-fg-faint",
	failed: "bg-danger",
	interrupted: "bg-fg-muted",
	stopped: "bg-fg-faint",
	unavailable: "bg-fg-faint",
};
export function AgentStatus({ status }: { status: AgentStatusValue }) {
	return (
		<span
			aria-hidden="true"
			data-agent-status={status}
			className={cx(
				"pointer-events-none absolute -right-0.5 -bottom-0.5 z-30 size-2 rounded-round border border-surface",
				colors[status],
			)}
		/>
	);
}
