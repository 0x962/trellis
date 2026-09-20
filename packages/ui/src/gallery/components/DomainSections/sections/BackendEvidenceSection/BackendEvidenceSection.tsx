import { BackendEvidence, EvidenceStrip } from "../../../../../review";
import { Section } from "../../../Section";
import sequencePicture from "./picture/op43-route-sequence.svg";

// The records of OP-43, pull request 57080 of the canary repository, which
// adds a private route that answers the properties of one user.
const pytestRun = {
	id: "01M30A0000000000000000VRF1",
	command: "cd backend/canary && direnv exec . pytest canary/api/tests/test_staff_hotels.py",
	exit: 0,
	tail: "47 passed, 44 skipped in 9.10s",
};

const lintRun = {
	id: "01M30A0000000000000000VRF2",
	command: "cd backend/canary && direnv exec . make check-fix",
	exit: 1,
	tail: "canary/api/views/staff_hotels.py:42: line too long (121 > 120)",
};

const tests = [
	{
		id: "01M30A0000000000000000TEST",
		state: "named" as const,
		name: "test_staff_hotels_names_no_other_property",
		failsOn: "4c9a771",
		passesOn: "8b21f0c",
	},
];

const contracts = [
	{
		id: "01M30A0000000000000000CONT",
		state: "changed" as const,
		before: "GET /api/private/staff-hotels · 403 for a service identity",
		after: "GET /api/private/staff-hotels?user=<uuid> · 200 {properties: [{id, name}]}",
	},
];

const picture = {
	url: sequencePicture,
	why: "The call path crosses from Operator into Canary, so the picture names every hop.",
};

const missing = [
	{
		label: "summary",
		fillCommand: 'trellis summary write 57080 --headline "..." --why - --watch "..."',
	},
	{
		label: "contract table",
		fillCommand: "trellis evidence add 57080 --kind contract --before - --after -",
	},
];

const copy = () => {};

export function BackendEvidenceSection() {
	return (
		<Section name="BackendEvidence" note="filled with one picture, two records missing" className="items-start">
			<div className="min-w-80 flex-1">
				<EvidenceStrip present={6} required={6} missing={[]} hasRecords={true} onCopy={copy}>
					<BackendEvidence
						verify={[pytestRun, lintRun]}
						tests={tests}
						contracts={contracts}
						migration={{
							plan: "phase: expand · lock: none · rollback: drop the column",
							filename: "0089_staff_hotels.sql",
						}}
						picture={picture}
						onCopy={copy}
					/>
				</EvidenceStrip>
			</div>
			<div className="min-w-80 flex-1">
				<EvidenceStrip present={2} required={4} missing={missing} hasRecords={true} onCopy={copy}>
					<BackendEvidence
						verify={[lintRun]}
						tests={[{ id: "01M30A0000000000000000TES2", state: "none", reason: "the change deletes a dead branch" }]}
						contracts={[]}
						migration={null}
						picture={null}
						onCopy={copy}
					/>
				</EvidenceStrip>
			</div>
		</Section>
	);
}
