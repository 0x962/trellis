import type { ReactNode } from "react";
import { Tabs } from "../../primitives/Tabs";
import { cx } from "../../utils/cx";

type CheckStatus = "failed" | "blocked" | "running" | "done" | null;

const statusLabels: Record<Exclude<CheckStatus, null>, string> = {
	blocked: "Blocked",
	failed: "Failed",
	running: "Running",
	done: "Done",
};

export function ReviewTabs({
	value,
	onValueChange,
	count,
	live,
	liveStatus,
	checkStatus,
	children,
}: {
	value: string;
	onValueChange: (value: string) => void;
	count: number;
	live: boolean;
	liveStatus?: string;
	checkStatus: CheckStatus;
	children: ReactNode;
}) {
	const sections = [
		{ value: "changes", label: "Changes" },
		{ value: "discussion", label: count ? `Conversation ${count}` : "Conversation" },
		{
			value: "checks",
			label: (
				<span className="inline-flex items-center gap-1.5">
					Checks
					{checkStatus && (
						<span
							className={cx(
								"font-medium",
								checkStatus === "running" && "review-check-tab-running",
								checkStatus === "done" && "text-success",
								(checkStatus === "failed" || checkStatus === "blocked") && "text-danger",
							)}
						>
							{statusLabels[checkStatus]}
						</span>
					)}
				</span>
			),
		},
		{ value: "runs", label: "Runs" },
		...(live ? [{ value: "live", label: liveStatus ? `Live Branch · ${liveStatus}` : "Live Branch" }] : []),
	];
	return (
		<Tabs
			className="review-tabs-layout"
			value={value}
			onValueChange={onValueChange}
			items={sections.map((section) => ({ ...section, content: section.value === value ? children : null }))}
		/>
	);
}
