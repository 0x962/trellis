import { ChecksLine, type ChecksLineCheck } from "../../../../review";
import "../../../../review/review.css";
import { useState } from "react";
import { Section } from "../../Section";

const checkLink = "https://github.com/0x962/trellis/actions";
const checks: ChecksLineCheck[] = [
	{ name: "merge_gatekeeper", workflow: "9.AUTO Merge gatekeeper", bucket: "fail", link: checkLink },
	{
		name: "Playwright Critical Tests",
		workflow: "10.CAN.AUTO UI Critical Tests (PR)",
		bucket: "pending",
		link: checkLink,
	},
	{ name: "Backend linters", workflow: "9.CAN.AUTO Check Canary", bucket: "pending", link: checkLink },
	{
		name: "make check-migrations && make migrate",
		workflow: "9.CAN.AUTO Check Canary",
		bucket: "pending",
		link: checkLink,
	},
	{ name: "make test-backend", workflow: "9.CAN.AUTO Check Canary Backend Tests", bucket: "pending", link: checkLink },
	{ name: "OpenAPI staleness (canary)", workflow: "9.OAS.AUTO OpenAPI specs", bucket: "pending", link: checkLink },
	{ name: "Check backend translations are up to date", workflow: "i18n Backend", bucket: "pending", link: checkLink },
	...Array.from({ length: 47 }, (_, index) => ({
		name: `Passed check ${index + 1}`,
		workflow: "CI",
		bucket: "pass" as const,
		link: checkLink,
	})),
	...Array.from({ length: 44 }, (_, index) => ({
		name: `Skipped check ${index + 1}`,
		workflow: "CI",
		bucket: "skipping" as const,
		link: checkLink,
	})),
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
				<ChecksLine
					checks={checks}
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
