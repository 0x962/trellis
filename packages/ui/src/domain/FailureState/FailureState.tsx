import { WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { OutputBlock } from "../../primitives/OutputBlock";
import { Spinner } from "../../primitives/Spinner";

// What trellis does about a failure while the person reads it.
// `retrying` means trellis sends the request again on a timer. `waiting`
// means trellis holds the page until the live connection to the server
// comes back, and then loads the page again. `none` means the failure
// stays until the person acts.
export type FailureRecovery = "retrying" | "waiting" | "none";

// The one sentence each kind of recovery prints. The component owns these
// words, so two screens that both wait for the server say the same thing.
const recoveryLines: Record<FailureRecovery, string | null> = {
	retrying: "Trellis is trying again.",
	waiting: "Trellis is waiting for the server, and opens this page again when the server answers.",
	none: null,
};

export type FailureStateProps = {
	// One sentence in plain words that says what happened, such as "The
	// agent stopped before it finished". It never carries an exit code, an
	// exception class, a file path or a message that a server wrote.
	title: string;
	// One more sentence of fact that the person needs to decide what to do
	// next, such as what trellis kept and what a new start does.
	description?: ReactNode;
	// What trellis does about the failure without the person.
	recovery?: FailureRecovery;
	// The action that usually works, as a `Button` with `size="md"` or a
	// link drawn as one. It sits beside the words, not in a bar somewhere
	// else on the screen.
	action?: ReactNode;
	// The second action, for the person the first action does not help.
	secondAction?: ReactNode;
	// The raw text that a developer reads: the message an exception
	// carries, the line a process printed, the path of a binary. A closed
	// disclosure holds it, and the text stays selectable.
	detail?: string | null;
	// `page` fills a route or a pane. `section` sits inside a tab or a list.
	variant?: "section" | "page";
	className?: string;
};

// The one way trellis shows a failure. Every error surface in the product
// uses it, so a person reads the same shape whatever broke.
//
// The rules it holds:
//
// 1. The title says what happened in plain words. It never carries a code,
//    a raw exception, a process line or a path.
// 2. One line says what trellis does about it, from `recovery`: it is
//    trying again, it is waiting for the server, or it says nothing
//    because trellis does nothing.
// 3. One action, and at most two. `action` comes first and is the one that
//    usually works.
// 4. A failure that recovers by itself says so through `recovery`. The
//    caller clears the failure when the cause goes away, so the person
//    never presses a button that the product could press for them.
// 5. `detail` holds what a developer needs. It sits in a closed
//    disclosure, under the action, never in the title.
// 6. The words carry no blame, no apology and no exclamation mark.
// 7. It draws the empty state shape with no picture, so the words take the
//    top of the pane. Red marks one thing: the small sign beside the title.
export function FailureState({
	title,
	description,
	recovery = "none",
	action,
	secondAction,
	detail,
	variant = "section",
	className,
}: FailureStateProps) {
	const page = variant === "page";
	const line = recoveryLines[recovery];
	return (
		<EmptyState
			variant={variant}
			image={null}
			className={className}
			title={
				<span className="flex items-start gap-2">
					{/* The mark sits on the first line of a title that wraps, not in
					    the middle of the block. The top margin is half the space
					    the line box leaves around the mark: (28 - 20) / 2 at the
					    page size, and (20 - 16) / 2 at the section size. */}
					<WarningCircle
						aria-hidden="true"
						className={page ? "mt-1 size-5 shrink-0 text-danger" : "mt-0.5 size-4 shrink-0 text-danger"}
					/>
					{title}
				</span>
			}
			description={
				description === undefined && line === null ? undefined : (
					<>
						{description !== undefined && <span className="block">{description}</span>}
						{line !== null && (
							<span className="mt-1 flex items-center gap-1.5">
								{recovery === "retrying" && <Spinner className="size-3" />}
								{line}
							</span>
						)}
					</>
				)
			}
			action={
				action === undefined && secondAction === undefined && !detail ? undefined : (
					<div className="flex flex-col items-start gap-3">
						{(action !== undefined || secondAction !== undefined) && (
							<div className="flex flex-wrap items-center gap-2">
								{action}
								{secondAction}
							</div>
						)}
						{detail && (
							<details className="max-w-xl text-xs text-fg-muted">
								<summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
									Details
								</summary>
								<OutputBlock text={detail} className="mt-1 break-all" />
							</details>
						)}
					</div>
				)
			}
		/>
	);
}
