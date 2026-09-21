import { useState } from "react";
import { type FileRiskGroup, FileRiskGroups } from "../../../../review/FileRiskGroups";
import { Section } from "../../Section";

const example: FileRiskGroup[] = [
	{
		key: "risk",
		label: "Risk",
		files: [
			{
				path: "backend/canary/api/private/staff_hotels.py",
				change: "change",
				additions: 94,
				deletions: 2,
				read: false,
			},
			{ path: "backend/canary/api/private/urls.py", change: "change", additions: 24, deletions: 2, read: false },
		],
	},
	{
		key: "behavior",
		label: "Behavior",
		files: [
			{
				path: "backend/canary/hotels/services/membership.py",
				change: "change",
				additions: 58,
				deletions: 4,
				read: false,
			},
			{ path: "backend/canary/hotels/selectors.py", change: "change", additions: 13, deletions: 2, read: true },
		],
	},
	{
		key: "tests",
		label: "Tests",
		files: [
			{
				path: "backend/canary/api/private/tests/test_staff_hotels.py",
				change: "new",
				additions: 122,
				deletions: 2,
				read: false,
			},
		],
	},
	{
		key: "noise",
		label: "Noise",
		files: [{ path: "backend/canary/api/openapi.gen.json", change: "change", additions: 0, deletions: 0, read: false }],
	},
];

export function FileRiskGroupsSection() {
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(["noise"]));
	const [selected, setSelected] = useState("backend/canary/api/private/urls.py");
	const toggle = (set: ReadonlySet<string>, key: string) => {
		const next = new Set(set);
		if (!next.delete(key)) next.add(key);
		return next;
	};
	return (
		<Section
			name="FileRiskGroups"
			note="four groups; a line count per group; Noise collapsed; a directory tree per group; one file read and dimmed"
		>
			<div className="w-full max-w-160 rounded-md border border-border bg-pane py-1">
				<FileRiskGroups
					groups={example}
					selected={selected}
					onSelect={setSelected}
					isCollapsed={(key) => collapsed.has(key)}
					onToggle={(key) => setCollapsed((current) => toggle(current, key))}
				/>
			</div>
		</Section>
	);
}
