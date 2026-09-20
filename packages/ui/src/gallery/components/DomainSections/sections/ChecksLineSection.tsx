import { type CheckResultGroup, CheckResults } from "../../../../review";
import "../../../../review/review.css";
import { useState } from "react";
import { Section } from "../../Section";

const result = (key: string, name: string, workflow: string, status: "failed" | "pending") => ({
	key,
	name,
	workflow,
	status,
	label: status === "failed" ? "Failed" : "Pending",
	url: "https://github.com/0x962/trellis/actions",
	duration: null,
});

const groups: CheckResultGroup[] = [
	{
		key: "failed",
		label: "Failed",
		checks: [result("failed", "merge_gatekeeper", "9.AUTO Merge gatekeeper", "failed")],
	},
	{
		key: "pending",
		label: "Pending",
		checks: [
			result("pending-1", "Playwright Critical Tests", "10.CAN.AUTO UI Critical Tests (PR)", "pending"),
			result("pending-2", "Backend linters", "9.CAN.AUTO Check Canary", "pending"),
			result("pending-3", "make check-migrations && make migrate", "9.CAN.AUTO Check Canary", "pending"),
			result("pending-4", "make test-backend", "9.CAN.AUTO Check Canary Backend Tests", "pending"),
			result("pending-5", "OpenAPI staleness (canary)", "9.OAS.AUTO OpenAPI specs", "pending"),
			result("pending-6", "Check backend translations are up to date", "i18n Backend", "pending"),
		],
	},
	{
		key: "success",
		label: "Passed",
		checks: Array.from({ length: 47 }, (_, index) => ({
			...result(`passed-${index}`, `Passed check ${index + 1}`, "CI", "pending"),
			status: "success" as const,
			label: "Passed",
		})),
	},
	{
		key: "skipped",
		label: "Skipped",
		checks: Array.from({ length: 44 }, (_, index) => ({
			...result(`skipped-${index}`, `Skipped check ${index + 1}`, "CI", "pending"),
			status: "skipped" as const,
			label: "Skipped",
		})),
	},
];

export function ChecksLineSection() {
	const [collapsed, setCollapsed] = useState(["success", "skipped"]);
	return (
		<Section
			name="ChecksLine"
			note="failed and pending details; passed and skipped collapsed"
			className="items-stretch"
		>
			<div className="w-full">
				<CheckResults
					title="1 failed · 6 pending · 47 passed · 44 skipped"
					groups={groups}
					isCollapsed={(key) => collapsed.includes(key)}
					onToggle={(key) =>
						setCollapsed((current) =>
							current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
						)
					}
				/>
			</div>
		</Section>
	);
}
