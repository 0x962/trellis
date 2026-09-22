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

// The sentence for a check notice or a merge notice that a newer commit, a
// newer notice, or a merged or closed pull request replaced before the send.
export const supersededCheck = "A newer commit or a newer result replaced this notice before delivery.";
