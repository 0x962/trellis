import { Fragment, type ReactNode } from "react";
import { Button } from "../../primitives/Button";
import { TicketId } from "../TicketId";

// One ticket that holds this ticket back. `words` says what the ticket
// still owes, such as `is not merged` or `is open`. The caller writes the
// words, because the reason belongs to the ticket data and not to this
// visual.
export type StartBlocker = {
	identifier: string;
	title: string;
	words: string;
};

export type StartControlsProps = {
	// The harness picker, the model picker and the effort picker, in that
	// order. The page that holds the harness state builds them.
	pickers: ReactNode;
	// Every ticket that holds this ticket back. `Start` stays live whatever
	// this list holds: the person is the manager, and he decides when a run
	// starts.
	blockers: readonly StartBlocker[];
	// True while the server starts the run. `Start` shows a turning ring and
	// takes no second click.
	starting: boolean;
	// Why the last start failed, in the words of the server. It is null while
	// no start failed.
	error: string | null;
	onStart: () => void;
};

// The row that starts a run on a ticket that no agent holds: three pickers,
// one `Start`, and one line that names each ticket this one waits for.
export function StartControls({ pickers, blockers, starting, error, onStart }: StartControlsProps) {
	return (
		<section aria-label="Start a run" className="flex min-w-0 flex-col gap-1.5">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<span className="shrink-0 text-sm text-fg-muted">Start with</span>
				{pickers}
				<Button className="ml-auto" variant="primary" processing={starting} onClick={onStart}>
					Start
				</Button>
			</div>
			{blockers.length > 0 && (
				<p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-fg-muted">
					{blockers.map((blocker, index) => (
						<Fragment key={blocker.identifier}>
							{index > 0 && <span>and</span>}
							<TicketId id={blocker.identifier} size="sm" />
							<span className="max-w-96 truncate text-fg" title={blocker.title}>
								{blocker.title}
							</span>
							<span>
								{blocker.words}
								{index === blockers.length - 1 ? "." : ","}
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
