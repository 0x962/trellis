import { describe, expect, test } from "bun:test";
import type { TicketContract } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { ContractBlock } from "./ContractBlock";

// The contract of OP-34 in section 2, screen 5 of
// docs/research/trellis-for-one-human-and-many-agents.md.
const op34: TicketContract = {
	result: "The webhook settles the run row. The routines page reads the state.",
	files: ["backend/operator-service/agent/signals.py", "backend/operator-service/routines/services/run/run.py"],
	leaveAlone: ["routines/views/routine_run.py, OP-32 owns it"],
	verify: ["cd backend/operator-service && direnv exec . pytest routines threads agent"],
	reviewFocus: ["the import direction stays one way (routines imports agent, never the reverse)"],
};

const emptyContract: TicketContract = { result: "", files: [], leaveAlone: [], verify: [], reviewFocus: [] };

describe("ContractBlock", () => {
	test("prints the six clauses of the contract", () => {
		const html = renderToStaticMarkup(<ContractBlock repo="canary" contract={op34} />);

		expect(html).toContain("Result");
		expect(html).toContain("The webhook settles the run row.");
		expect(html).toContain("backend/operator-service/agent/signals.py");
		expect(html).toContain("Leave alone");
		expect(html).toContain("cd backend/operator-service &amp;&amp; direnv exec . pytest routines threads agent");
		expect(html).toContain("the import direction stays one way");
		expect(html).toContain("Evidence owed");
		expect(html).toContain("backend: summary · verify record · test proof · contract table");
	});

	test("prints the leave alone line whole, and cuts no word off it", () => {
		const html = renderToStaticMarkup(<ContractBlock repo="canary" contract={op34} />);
		const leaveAlone = html.slice(html.indexOf('aria-label="Copy routines/views/routine_run.py'));

		expect(html).toContain("routines/views/routine_run.py, OP-32 owns it");
		expect(leaveAlone.slice(0, leaveAlone.indexOf("</button>"))).not.toContain("truncate");
	});

	test("prints one line when the ticket names no contract", () => {
		const html = renderToStaticMarkup(<ContractBlock repo="trellis" contract={emptyContract} />);

		expect(html).toContain("The ticket names no contract.");
		expect(html).not.toContain("Evidence owed");
	});

	test("prints none for a clause the contract leaves empty", () => {
		const html = renderToStaticMarkup(
			<ContractBlock
				repo="trellis"
				contract={{ ...emptyContract, result: "One failed start does not end the sweep pass." }}
			/>,
		);

		expect(html).toContain("One failed start does not end the sweep pass.");
		expect(html).toContain("none");
		expect(html).toContain("unknown. The contract names no file.");
	});
});
