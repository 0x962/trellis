import { ArrowSquareOut } from "@phosphor-icons/react";
import { Badge } from "../../../../primitives/Badge";
import { Tooltip } from "../../../../primitives/Tooltip";
import { type CheckStatus, CheckStatusIcon } from "../../../CheckStatusIcon";

export type CheckResult = {
	key: string;
	name: string;
	status: CheckStatus;
	workflow?: string;
	url?: string;
	outcome: string;
	required?: boolean;
};

export type CheckResultRowProps = {
	check: CheckResult;
	// Opens the page of the check. The app that draws the row decides where
	// that page opens, because this package holds no browser sheet. Without
	// it, the link opens a tab of the browser.
	onOpen?: (url: string) => void;
};

export function CheckResultRow({ check, onOpen }: CheckResultRowProps) {
	const title = check.workflow ? `${check.workflow} / ${check.name}` : check.name;
	return (
		<li className="review-check-row">
			<CheckStatusIcon status={check.status} className="review-check-mark" />
			<div className="review-check-name">
				<Tooltip content={title}>
					<span className="review-check-title">{title}</span>
				</Tooltip>
			</div>
			{check.required && (
				<Badge tone="neutral" size="sm" className="review-check-required">
					Required
				</Badge>
			)}
			<span className="review-check-outcome tabular">{check.outcome}</span>
			{check.url && (
				<a
					href={check.url}
					target="_blank"
					rel="noreferrer"
					className="review-check-link"
					onClick={
						onOpen === undefined
							? undefined
							: (event) => {
									// A modifier click and a middle click belong to the
									// browser, and the href already answers both.
									if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
									event.preventDefault();
									onOpen(check.url!);
								}
					}
				>
					Details
					<ArrowSquareOut aria-hidden="true" className="size-3 shrink-0 text-fg-faint" />
					<span className="sr-only"> (opens in a new tab)</span>
				</a>
			)}
		</li>
	);
}
