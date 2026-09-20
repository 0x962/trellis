import { ContractBlock } from "../../../../review/ContractBlock";
import { Section } from "../../Section";

// OP-34 of the Routines E2E epic: a signal receiver that crosses two Django
// apps. Section 2, screen 5 of
// docs/research/trellis-for-one-human-and-many-agents.md holds these words.
const op34 = {
	result: "The webhook settles the run row. The routines page reads the state.",
	files: [
		"backend/operator-service/agent/signals.py",
		"backend/operator-service/agent/services/agent/agent.py",
		"backend/operator-service/routines/apps.py",
		"backend/operator-service/routines/services/run/run.py",
	],
	leaveAlone: ["backend/operator-service/routines/views/routine_run.py, OP-32 owns it"],
	verify: [
		"cd backend/operator-service && direnv exec . make check-fix",
		"cd backend/operator-service && direnv exec . pytest routines threads agent",
	],
	reviewFocus: [
		"the import direction stays one way (routines imports agent, never the reverse)",
		"a chat run looks for no routine run",
	],
	evidenceOwed: "backend: summary · verify record · test proof · contract table",
};

// OP-33 of the same epic: one function inside one service.
const op33 = {
	result: "One failed start does not end the sweep pass.",
	files: [
		"backend/operator-service/routines/services/run/run.py",
		"backend/operator-service/routines/services/run/run_test.py",
	],
	leaveAlone: ["backend/operator-service/routines/views/routine_run.py, OP-32 owns it"],
	verify: ["cd backend/operator-service && direnv exec . pytest routines"],
	reviewFocus: ["the cap of 50 holds the CronJob inside its two minute tick"],
	evidenceOwed: "backend: summary · verify record · test proof · contract table",
};

// A ticket that a person wrote before the planning agent filled the contract.
const emptyContract = {
	result: "",
	files: [],
	leaveAlone: [],
	verify: [],
	reviewFocus: [],
	evidenceOwed: "unknown. The contract names no file.",
};

export function ContractBlockSection() {
	return (
		<Section name="ContractBlock" note="OP-34, OP-33, and a ticket with no contract" className="items-start">
			<div className="min-w-96 flex-1">
				<ContractBlock {...op34} onCopy={() => {}} />
			</div>
			<div className="min-w-96 flex-1">
				<ContractBlock {...op33} onCopy={() => {}} />
			</div>
			<div className="min-w-96 flex-1">
				<ContractBlock {...emptyContract} onCopy={() => {}} />
			</div>
		</Section>
	);
}
