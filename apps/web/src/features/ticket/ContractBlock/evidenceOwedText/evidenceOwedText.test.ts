import { describe, expect, test } from "bun:test";
import { evidenceOwedText } from "./evidenceOwedText";

describe("evidenceOwedText", () => {
	test("names the frontend floor when every file renders a route", () => {
		const text = evidenceOwedText("trellis", [
			"apps/web/src/features/ticket/ContractBlock/ContractBlock.tsx",
			"packages/ui/src/review/ContractBlock/ContractBlock.tsx",
		]);

		expect(text).toBe("frontend: summary · after image · before image · capture record · console list");
	});

	test("names the backend floor when no file renders a route", () => {
		const text = evidenceOwedText("trellis", ["apps/server/src/services/tickets/contract.ts"]);

		expect(text).toBe("backend: summary · verify record · test proof · contract table · picture");
	});

	test("names both floors when the files render a route and change the server", () => {
		const text = evidenceOwedText("trellis", [
			"apps/web/src/routes/index.tsx",
			"apps/server/src/services/tickets/contract.ts",
		]);

		expect(text).toBe(
			"mixed: summary · after image · before image · capture record · console list · verify record · test proof · contract table · picture",
		);
	});

	test("reads the path rules of the named repository", () => {
		expect(evidenceOwedText("canary", ["frontend/src/App.tsx"])).toStartWith("frontend:");
		expect(evidenceOwedText("trellis", ["frontend/src/App.tsx"])).toStartWith("backend:");
	});

	test("names the equivalence condition for a test file", () => {
		expect(evidenceOwedText("trellis", ["apps/web/src/App.test.tsx"])).toEndWith(
			"A change that removes test cases also owes an equivalence proof.",
		);
	});

	test("says unknown when the contract names no file", () => {
		expect(evidenceOwedText("trellis", [])).toBe("unknown. The contract names no file.");
	});

	test("says unknown when the project uses no repository or more than one", () => {
		expect(evidenceOwedText(undefined, ["frontend/src/App.tsx"])).toBe(
			"unknown. The project uses no repository, or more than one.",
		);
	});
});
