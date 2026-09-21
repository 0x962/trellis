import { ChatCircle, CheckCircle, ClockCounterClockwise, XCircle } from "@phosphor-icons/react";
import { cx } from "@trellis/ui";
import { relativeTime } from "../../../../../lib/format";
import type { VerdictState } from "../../verdictState/verdictState";

const looks = {
	approved: { Icon: CheckCircle, tone: "text-success" },
	changes_requested: { Icon: XCircle, tone: "text-danger" },
	stale: { Icon: ClockCounterClockwise, tone: "text-warning" },
	note: { Icon: ChatCircle, tone: "text-fg-muted" },
} as const;

// One line: the glyph of the verdict, what the person did, when, and where
// the submission got to.
export function VerdictLine({ state }: { state: VerdictState }) {
	const { Icon, tone } = looks[state.kind];
	return (
		<p className="review-verdict-bar-state" data-verdict={state.kind}>
			<Icon className={cx("size-4 shrink-0", tone)} weight="fill" aria-hidden={true} />
			<span className="text-fg">{state.headline}</span>
			<span className="text-fg-muted">
				<time dateTime={state.createdAt}>{relativeTime(state.createdAt)}</time> · {state.delivery}
			</span>
		</p>
	);
}
