import {
	CheckIcon,
	DotFillIcon,
	QuestionIcon,
	SkipIcon,
	SquareFillIcon,
	StopIcon,
	XCircleFillIcon,
} from "@primer/octicons-react";
import type { CheckStatus } from "../../domain/checkStatus";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";
import { CheckRunSpinner } from "./components/CheckRunSpinner";

export type { CheckStatus } from "../../domain/checkStatus";

const labels: Record<CheckStatus, string> = {
	success: "Check passed",
	failed: "Check failed",
	pending: "Check pending",
	running: "Check running",
	canceled: "Check canceled",
	skipped: "Check skipped",
	neutral: "Check neutral",
	unknown: "Check unknown",
};

const icons = {
	success: CheckIcon,
	failed: XCircleFillIcon,
	pending: DotFillIcon,
	canceled: StopIcon,
	skipped: SkipIcon,
	neutral: SquareFillIcon,
	unknown: QuestionIcon,
};

export function CheckStatusIcon({
	status,
	className,
	tooltip = true,
	focusable = true,
}: {
	status: CheckStatus;
	className?: string;
	tooltip?: boolean;
	focusable?: boolean;
}) {
	const label = labels[status];
	const icon =
		status === "running" ? (
			<CheckRunSpinner />
		) : (
			(() => {
				const Icon = icons[status];
				return (
					<Icon
						aria-hidden="true"
						size={16}
						className={cx(
							"size-4 shrink-0",
							status === "success"
								? "text-success"
								: status === "failed"
									? "text-danger"
									: status === "pending"
										? "text-warning"
										: "text-fg-muted",
						)}
					/>
				);
			})()
		);
	const mark = (
		<span
			role="img"
			aria-label={label}
			tabIndex={tooltip && focusable ? 0 : undefined}
			className={cx("inline-grid size-4 shrink-0 place-items-center", className)}
		>
			{icon}
		</span>
	);
	return tooltip ? <Tooltip content={label}>{mark}</Tooltip> : mark;
}
