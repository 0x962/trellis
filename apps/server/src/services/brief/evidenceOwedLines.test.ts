import { expect, test } from "bun:test";
import type { TicketContract } from "@trellis/api";
import { evidenceOwedLines } from "./evidenceOwedLines.ts";

const contract = (files: string[]): TicketContract => ({
	result: "Done.",
	files,
	leaveAlone: [],
	verify: [],
	reviewFocus: [],
});

const meaning = [
	"Evidence shows this change working in the running product.",
	"A diff, a test count, a typecheck and a lint run are verification. They are not evidence.",
	"Send every record that the list names. Send the proof of the running product with them.",
];

test("prints the backend evidence floor with the command of each item", () => {
	const lines = evidenceOwedLines(contract(["apps/server/src/services/brief.ts"]), "trellis");

	expect(lines.slice(0, 5)).toEqual(["## Evidence owed", "", ...meaning]);
	expect(lines).toContain("- Kind: backend");
	expect(lines).toContain('- summary: trellis summary write <pr> --headline "..." --why - --watch "..."');
	expect(lines).toContain("  Write a simple, direct explanation of what changed and why, in plain words.");
	expect(lines).toContain("  Use real names such as webhook, API, migration, and the page name.");
	expect(lines).toContain(
		"- working call: trellis evidence add <pr> --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>",
	);
	expect(lines).toContain(
		"- failing call: trellis evidence add <pr> --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>",
	);
});

test("prints the frontend evidence floor with the command of each item", () => {
	const lines = evidenceOwedLines(contract(["apps/web/src/routes/index.tsx"]), "trellis");

	expect(lines).toContain("- Kind: frontend");
	expect(lines).toContain(
		'- after image: trellis evidence add <pr> --kind after --file <path> --route <route> --viewport 1440x900 --theme dark --seed "<command>" --browser <browser> --sha <head>',
	);
	expect(lines).toContain("- console list: trellis evidence add <pr> --kind console --file <path>");
});

test("tells a frontend change how to prove the screen, and names no service steps", () => {
	const lines = evidenceOwedLines(contract(["apps/web/src/routes/index.tsx"]), "trellis");

	expect(lines).toContain("Prove the screen:");
	expect(lines).toContain(
		"3. Capture the same route on both servers in Aside, at 1440x900, in the dark theme, with the animations off.",
	);
	expect(lines).not.toContain("Prove the service:");
});

test("tells a backend change how to prove the service, and names no screen steps", () => {
	const lines = evidenceOwedLines(contract(["apps/server/src/services/brief.ts"]), "trellis");

	expect(lines).toContain("Prove the service:");
	expect(lines).toContain(
		"2. Call the change on that server with curl or with the trellis CLI. Call the error case as well.",
	);
	expect(lines).toContain(
		"3. Send each API request as a call record with the method, path, request body, status, response body and server address.",
	);
	expect(lines).toContain(
		"4. Send each CLI or background-job command as a run record with the command, exit code, output and server address.",
	);
	expect(lines).not.toContain("Prove the screen:");
});

test("tells a mixed change to prove the screen and the service", () => {
	const lines = evidenceOwedLines(
		contract(["apps/web/src/routes/index.tsx", "apps/server/drizzle/0088_answer.sql"]),
		"trellis",
	);

	expect(lines).toContain("- Kind: mixed");
	expect(lines).toContain("Prove the screen:");
	expect(lines).toContain("Prove the service:");
	expect(lines.indexOf("Prove the screen:")).toBeLessThan(lines.indexOf("Prove the service:"));
	expect(lines).toContain("- migration plan: trellis evidence add <pr> --kind migration --file <path>");
});

test("names the equivalence condition for a test file", () => {
	expect(evidenceOwedLines(contract(["apps/web/src/App.test.tsx"]), "trellis")).toContain(
		"- A change that removes test cases also owes an equivalence proof.",
	);
});

test("ends every floor with the hand-over check", () => {
	for (const files of [["apps/web/src/routes/index.tsx"], ["apps/server/src/services/brief.ts"]]) {
		const lines = evidenceOwedLines(contract(files), "trellis");
		expect(lines.at(-1)).toBe("Check the floor before you hand over: trellis evidence check <pr>");
	}
});

test("states what evidence means even when the contract names no file", () => {
	const expected = [
		"## Evidence owed",
		"",
		...meaning,
		"",
		"- unknown. The contract names no file.",
		"",
		"Read the floor of your pull request: trellis evidence check <pr>",
	];

	expect(evidenceOwedLines(contract([]), "trellis")).toEqual(expected);
	expect(evidenceOwedLines(contract(["apps/server/src/services/brief.ts"]), undefined)).toEqual(expected);
});

test("separates every block with one blank line and ends with no blank line", () => {
	const lines = evidenceOwedLines(contract(["apps/web/src/routes/index.tsx"]), "trellis");

	expect(lines.at(-1)).not.toBe("");
	expect(lines.join("\n")).not.toContain("\n\n\n");
});
