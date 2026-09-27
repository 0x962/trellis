export type HostReadinessReportView = {
	ready: boolean;
	satisfied: readonly HostReadinessPrerequisiteView[];
	missing: readonly HostReadinessPrerequisiteView[];
};

export type HostReadinessPrerequisiteView = {
	kind: string;
	name: string;
	detail: string;
	hostPath: string | null;
	instruction: string | null;
};

const itemText = (item: HostReadinessPrerequisiteView) => {
	const path = item.hostPath === null ? "" : `\n  Host path: ${item.hostPath}`;
	const instruction = item.instruction === null ? "" : `\n  Action: ${item.instruction}`;
	return `[${item.kind}] ${item.name}\n  ${item.detail}${path}${instruction}`;
};

const section = (title: string, items: readonly HostReadinessPrerequisiteView[]) =>
	`${title}\n${items.length === 0 ? "  None" : items.map(itemText).join("\n")}\n`;

export function hostReadinessText(report: HostReadinessReportView): string {
	return `HOST READINESS\nStatus: ${report.ready ? "ready" : "not ready"}\n\n${section(
		"SATISFIED",
		report.satisfied,
	)}\n${section("MISSING", report.missing)}`;
}
