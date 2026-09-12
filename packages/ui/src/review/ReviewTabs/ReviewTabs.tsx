import type { ReactNode } from "react";
import { Tabs } from "../../primitives/Tabs";

export function ReviewTabs({
	value,
	onValueChange,
	count,
	live,
	children,
}: {
	value: string;
	onValueChange: (value: string) => void;
	count: number;
	live: boolean;
	children: ReactNode;
}) {
	const sections = [
		{ value: "changes", label: "Changes" },
		{ value: "discussion", label: count ? `Conversation ${count}` : "Conversation" },
		{ value: "checks", label: "Checks" },
		{ value: "runs", label: "Runs" },
		...(live ? [{ value: "live", label: "Live Branch" }] : []),
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
