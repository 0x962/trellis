import { useMemo } from "react";
import { CheckResults } from "../CheckResults";
import { checksLineResult } from "./checksLineResult/checksLineResult";
import type { ChecksLineCheck, checkDisplay } from "./checkWords/checkWords";

export function ChecksLine({
	checks,
	loading = false,
	isCollapsed,
	onToggle,
}: {
	checks: readonly ChecksLineCheck[];
	loading?: boolean;
	isCollapsed: (key: (typeof checkDisplay)[number]["status"]) => boolean;
	onToggle: (key: (typeof checkDisplay)[number]["status"]) => void;
}) {
	const result = useMemo(() => checksLineResult(checks), [checks]);
	return (
		<CheckResults
			title={result.title}
			groups={result.groups}
			loading={loading}
			isCollapsed={isCollapsed}
			onToggle={onToggle}
		/>
	);
}
