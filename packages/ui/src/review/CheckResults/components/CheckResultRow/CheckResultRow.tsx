import { ArrowSquareOut } from "@phosphor-icons/react";
import { Tooltip } from "../../../../primitives/Tooltip";
import { type CheckStatus, CheckStatusIcon } from "../../../CheckStatusIcon";

export type CheckResult = {
	key: string;
	name: string;
	status: CheckStatus;
	workflow?: string;
	url?: string;
	// How long the check took, in words such as `2m 14s`. A check that still
	// runs carries none.
	duration?: string;
};

export type CheckResultRowProps = {
	check: CheckResult;
	// Opens the page of the check. The app that draws the row decides where
	// that page opens, because this package holds no browser sheet. Without
	// it, the link opens a tab of the browser.
	onOpen?: (url: string) => void;
};

export function CheckResultRow({ check, onOpen }: CheckResultRowProps) {
	return (
		<li className="review-check-row">
			<CheckStatusIcon status={check.status} className="review-check-mark" />
			<div className="review-check-name">
				<Tooltip content={check.name}>
					{check.url ? (
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
			{check.duration && <span className="review-check-duration tabular">{check.duration}</span>}
		</li>
	);
}
