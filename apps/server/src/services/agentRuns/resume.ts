// How a manager start tells a resume that worked from one that did not.
// An agent exits within about a second when it does not find the session
// it is told to resume, and it stays up when it does. The start watches
// the new terminal for that long before it calls the resume a success.
const settleMs = 3000;
const checkEveryMs = 500;

export const exitedSoon = async (exited: () => Promise<boolean>) => {
	const until = Date.now() + settleMs;
	for (;;) {
		if (await exited()) return true;
		if (Date.now() >= until) return false;
		await Bun.sleep(checkEveryMs);
	}
};

// The last lines of a terminal, which is where an agent prints why it exited.
export const outputTail = (text: string, lines = 5) =>
	text
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line !== "")
		.slice(-lines)
		.join("\n");

// The error a lost resume records. `where` names the place the server told
// the agent to run, so the person reads which machine, workspace, and
// directory held no session.
export const lostSessionMessage = (input: { sessionId: string; where: string; printed: string }) =>
	`Could not resume agent session ${input.sessionId} in ${input.where}. The terminal exited at once.${
		input.printed === "" ? "" : ` The agent printed:\n${input.printed}`
	}`;
