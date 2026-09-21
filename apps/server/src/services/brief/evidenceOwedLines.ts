import { contractFloor, evidenceFillCommands, evidenceWords, type TicketContract } from "@trellis/api";

// An agent that reads a bare list of nouns sends a test count and calls the
// work proved. These three sentences sit above the list, and every item of
// the list carries the one command that submits it.
const meaning = [
	"Evidence shows this change working in the running product.",
	"A diff, a test count, a typecheck and a lint run are verification. They are not evidence.",
	"Send every record that the list names. Send the proof of the running product with them.",
];

// A change that renders a route owes two images of the same route: one from a
// server on this branch, and one from a server on the merge base.
const screenProof = [
	"Prove the screen:",
	"",
	"1. Start a server on this branch. Start a second server on the merge base. Give each server its own port and its own data home.",
	"2. Run the same seed command against both servers.",
	"3. Capture the same route on both servers in Aside, at 1440x900, in the dark theme, with the animations off.",
	"4. Add a clip when the change touches motion, a gesture, scroll, a timed action, or a task of more than one step. Keep the clip to 15 seconds or less.",
	'5. Send the clip: trellis evidence add <pr> --kind clip --file <path> --route <route> --caption "..."',
	"6. Read the full recipe in docs/EVIDENCE.md.",
];

// A change that renders no route owes the real requests and the real
// responses of a server that runs this branch. Today the verify record holds
// the call and the contract record holds the two responses.
const serviceProof = [
	"Prove the service:",
	"",
	"1. Start a server on this branch, on its own port and its own data home.",
	"2. Call the change on that server with curl or with the trellis CLI. Call the error case as well.",
	"3. Send each call as a verify record. The command is the curl command or the trellis command. A test command does not prove the product.",
	"4. Put the status and the response body in the tail of that record.",
	"5. Put the response of the merge base and the response of the head in the contract record.",
	"6. Read the full recipe in docs/EVIDENCE.md.",
];

const handOver = ["Check the floor before you hand over: trellis evidence check <pr>"];

// One blank line between each block, and no blank line at the end. `brief`
// joins the sections, so a trailing blank line here doubles a separator.
const joinBlocks = (blocks: string[][]): string[] =>
	blocks.flatMap((block, index) => (index === 0 ? block : ["", ...block]));

export const evidenceOwedLines = (contract: TicketContract, repositoryName: string | undefined): string[] => {
	const floor = contractFloor(repositoryName, contract);
	if (floor === null)
		return joinBlocks([
			["## Evidence owed", "", ...meaning],
			["- unknown. The contract names no file."],
			["Read the floor of your pull request: trellis evidence check <pr>"],
		]);
	return joinBlocks([
		["## Evidence owed", "", ...meaning],
		[
			`- Kind: ${floor.kind}`,
			...floor.required.map((item) => `- ${evidenceWords[item]}: ${evidenceFillCommands[item]}`),
			...floor.notes.map((note) => `- ${note}`),
		],
		...(floor.kind === "backend" ? [] : [screenProof]),
		...(floor.kind === "frontend" ? [] : [serviceProof]),
		handOver,
	]);
};
