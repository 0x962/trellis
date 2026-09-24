import { PushPin } from "@phosphor-icons/react";
import { Tooltip } from "../../primitives/Tooltip";

export type PinMarkProps = {
	tooltip?: boolean;
	focusable?: boolean;
};

// The filled pin shows that a session stays in its list after its process or
// ticket ends. The accessible name and the tooltip use the same state word.
export function PinMark({ tooltip = true, focusable = true }: PinMarkProps) {
	const mark = (
		<span
			data-pin-mark=""
			role="img"
			aria-label="Pinned"
			tabIndex={tooltip && focusable ? 0 : undefined}
			className="inline-flex size-4 shrink-0 items-center justify-center text-fg-muted"
		>
			<PushPin weight="fill" className="size-3.5" aria-hidden={true} />
		</span>
	);
	return tooltip ? <Tooltip content="Pinned">{mark}</Tooltip> : mark;
}
