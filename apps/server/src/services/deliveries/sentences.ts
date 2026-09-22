// The one sentence a person reads for a delivery that stays uncertain.
// Trellis writes it when a send gives no result, and it stays on the row
// while the execution service cannot say whether the agent got the bytes.
// Every delivery kind uses this sentence, so a person learns one rule.
export const unconfirmedDelivery =
	"Trellis could not confirm that the agent received this message. Inspect the agent's terminal before a resend.";

// The sentence for a delivery that Trellis proved lost: the agent session
// ended, and the input ledger of that session holds no record of the
// message. A new send needs a running agent.
export const lostDelivery = "The agent session ended without this message. Resend it to a running agent.";

// The sentence for a message that no agent can take yet: the ticket of the
// message has no agent process that runs. Trellis keeps the message and
// sends it when a run of that ticket runs again.
export const waitingForRun = "No agent of this ticket runs. Trellis sends this message when one starts.";

// The sentence for a check notice or a merge notice that a newer commit or
// a newer notice replaced before the send.
export const supersededCheck = "A newer commit or a newer result replaced this notice before delivery.";

// The sentence for a message that waited while its pull request merged or
// closed. Nobody works on that branch now, so the message has no reader.
export const pullRequestEnded = "The pull request merged or closed before this message reached an agent.";

// The sentence for a message that waited a whole day for an agent of its
// ticket. Trellis keeps no message longer than that, because the work of
// the pull request has moved on by then.
export const waitedTooLong = "No agent of this ticket ran within a day, so this message never left.";

// The sentence for a message whose ticket holds a run that another program
// started. Trellis writes into the terminal of a run that it starts
// itself, so it cannot reach such an agent. The person reads the pull
// request on the page instead.
export const otherRuntime = (runtime: string) =>
	`The agent of this ticket runs on ${runtime}, which Trellis cannot write to. Read the pull request on the page.`;
