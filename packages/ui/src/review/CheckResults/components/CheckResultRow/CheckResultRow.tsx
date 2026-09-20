import { ArrowSquareOut } from "@phosphor-icons/react";
import { Tooltip } from "../../../../primitives/Tooltip";
import { type CheckStatus, CheckStatusIcon } from "../../../CheckStatusIcon";

export type CheckResult = {
	key: string;
	name: string;
	status: CheckStatus;
	workflow?: string;
	url?: string;
};

export function CheckResultRow({ check }: { check: CheckResult }) {
	return (
		<li className="review-check-row">
			<CheckStatusIcon status={check.status} className="review-check-mark" />
			<div className="review-check-name">
				<Tooltip content={check.name}>
					{check.url ? (
						<a href={check.url} target="_blank" rel="noreferrer" className="review-check-link">
							<span>{check.name}</span>
							<ArrowSquareOut aria-hidden="true" className="size-3 shrink-0 text-fg-faint" />
							<span className="sr-only"> (opens in a new tab)</span>
						</a>
					) : (
						<span className="review-check-title">{check.name}</span>
					)}
				</Tooltip>
				{check.workflow && (
					<span className="review-check-workflow" title={check.workflow}>
						{check.workflow}
					</span>
				)}
			</div>
		</li>
	);
}
