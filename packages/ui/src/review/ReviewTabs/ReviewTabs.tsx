import type { ReactNode } from "react";
import { Tabs } from "../../primitives/Tabs";

export type ReviewTabStatus = {
	label: string;
	tone: "success" | "warning" | "danger" | "neutral";
};

const tones: Record<ReviewTabStatus["tone"], string> = {
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	neutral: "bg-fg-faint",
};

function TabLabel({ label, status }: { label: string; status?: ReviewTabStatus }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{label}
			{status && (
				<>
					<span
						aria-hidden="true"
						title={status.label}
						className={`size-1.5 shrink-0 rounded-round ${tones[status.tone]}`}
					/>
					<span className="sr-only">{status.label}</span>
				</>
			)}
		</span>
	);
}

export function ReviewTabs({
	value,
	onValueChange,
	count,
	live,
	checksStatus,
	liveStatus,
	children,
}: {
	value: string;
	onValueChange: (value: string) => void;
	count: number;
	live: boolean;
	checksStatus?: ReviewTabStatus;
	liveStatus?: ReviewTabStatus;
	children: ReactNode;
}) {
	const sections = [
		{ value: "changes", label: "Changes" },
		{ value: "discussion", label: count ? `Conversation ${count}` : "Conversation" },
		{ value: "checks", label: <TabLabel label="Checks" status={checksStatus} /> },
		{ value: "runs", label: "Runs" },
		...(live ? [{ value: "live", label: <TabLabel label="Live Branch" status={liveStatus} /> }] : []),
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
