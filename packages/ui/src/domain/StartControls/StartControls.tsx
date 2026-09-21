import { Fragment, type ReactNode } from "react";
import { Button } from "../../primitives/Button";
import { TicketId } from "../TicketId";

// One ticket that holds this ticket back. `reason` says why that ticket is
// not done, such as `is not merged` or `is open`. The caller writes the
// reason, because it comes from the ticket data and not from this visual.
export type StartDependency = {
	identifier: string;
	title: string;
	reason: string;
};

export type StartControlsProps = {
	// The harness picker, the model picker and the effort picker, in that
	// order. The page that holds the harness state builds them.
	pickers: ReactNode;
	// Every ticket that holds this ticket back. `Start` stays live for every
	// value here. A person decides when a run starts.
	dependencies: readonly StartDependency[];
	// True while the server starts the run. `Start` shows a turning ring and
	// takes no second click.
	starting: boolean;
	// Why the last start failed, in the words of the server.
	error: string | null;
	// The text of the Start button. A dialog that starts many runs names the
	// count, such as `Start 4 agents`.
	label?: string;
	// True when there is nothing to start.
	disabled?: boolean;
	onStart: () => void;
};

// `Start` stays live even when another ticket holds this ticket back. A
// person reads the line under the row and decides when a run starts.
export function StartControls({
	pickers,
	dependencies,
	starting,
	error,
	label = "Start",
	disabled = false,
	onStart,
}: StartControlsProps) {
	return (
		<section aria-label="Start a run" className="flex min-w-0 flex-col gap-1.5">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<span className="shrink-0 text-sm text-fg-muted">Start with</span>
				{pickers}
				<Button className="ml-auto" variant="primary" processing={starting} disabled={disabled} onClick={onStart}>
					{label}
				</Button>
			</div>
			{dependencies.length > 0 && (
				<p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg-muted">
					{dependencies.map((dependency, index) => (
						<Fragment key={dependency.identifier}>
							{index > 0 && <span>and</span>}
							<TicketId id={dependency.identifier} size="sm" />
							<span className="max-w-96 truncate text-fg" title={dependency.title}>
								{dependency.title}
							</span>
							<span>
								{dependency.reason}
								{index === dependencies.length - 1 ? "." : ","}
							</span>
						</Fragment>
					))}
					<span>Start anyway?</span>
				</p>
			)}
			{error !== null && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
		</section>
	);
}
