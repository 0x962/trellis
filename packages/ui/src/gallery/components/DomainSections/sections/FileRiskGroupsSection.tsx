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
				binary: false,
				reasons: ["auth", "public API"],
			},
			{
				path: "backend/canary/api/private/urls.py",
				change: "change",
				additions: 24,
				deletions: 2,
				binary: false,
				reasons: ["public API"],
			},
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
				binary: false,
				reasons: [],
			},
			{
				path: "backend/canary/hotels/selectors.py",
				change: "change",
				additions: 13,
				deletions: 2,
				binary: false,
				reasons: [],
			},
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
				binary: false,
				reasons: [],
			},
		],
	},
	{
		key: "noise",
		label: "Noise",
		files: [
			{
				path: "backend/canary/api/openapi.gen.json",
				change: "change",
				additions: 0,
				deletions: 0,
				binary: false,
				reasons: [],
			},
			{
				path: "frontend/public/hotel-card.png",
				change: "new",
				additions: 0,
				deletions: 0,
				binary: true,
				reasons: [],
			},
		],
	},
];

const read: ReadonlySet<string> = new Set(["backend/canary/hotels/selectors.py"]);

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
			note="four groups; a line count per group; Noise collapsed; a directory tree per group; one file read and dimmed; a binary file prints the word binary"
		>
			<div className="w-full max-w-160 rounded-md border border-border bg-pane py-1">
				<FileRiskGroups
					groups={example}
					read={read}
					selected={selected}
					onSelect={setSelected}
					isCollapsed={(key) => collapsed.has(key)}
					onToggle={(key) => setCollapsed((current) => toggle(current, key))}
				/>
			</div>
		</Section>
	);
}
