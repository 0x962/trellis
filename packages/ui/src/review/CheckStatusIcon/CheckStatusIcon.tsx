import { Clock, MinusCircle, Prohibit, Question, XCircle } from "@phosphor-icons/react";
import type { CheckStatus } from "../../domain/checkStatus";
import { StatusIcon } from "../../domain/StatusIcon";
import { cx } from "../../utils/cx";

export type { CheckStatus } from "../../domain/checkStatus";

export function CheckStatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
	if (status === "success") return <StatusIcon category="done" className={className} />;
	if (status === "running") return <StatusIcon category="started" className={className} />;
	const icons = {
		failed: XCircle,
		pending: Clock,
		canceled: XCircle,
		skipped: Prohibit,
		neutral: MinusCircle,
		unknown: Question,
	};
	const Icon = icons[status];
	return (
		<Icon
			aria-hidden="true"
			weight={status === "failed" ? "fill" : "regular"}
			className={cx(
				"size-3.5 shrink-0",
				status === "failed" ? "text-danger" : status === "pending" ? "text-warning" : "text-fg-muted",
				className,
			)}
		/>
	);
}
