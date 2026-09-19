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
import { cx } from "../../utils/cx";
import { CheckRunSpinner } from "./components/CheckRunSpinner";

export type { CheckStatus } from "../../domain/checkStatus";

export function CheckStatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
	if (status === "running") return <CheckRunSpinner className={className} />;
	const icons = {
		success: CheckIcon,
		failed: XCircleFillIcon,
		pending: DotFillIcon,
		canceled: StopIcon,
		skipped: SkipIcon,
		neutral: SquareFillIcon,
		unknown: QuestionIcon,
	};
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
				className,
			)}
		/>
	);
}
