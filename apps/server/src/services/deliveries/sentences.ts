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

// The sentence for a delivery that waited for an agent run which ended
// before the send. The run holds a `closed_at` instant, so no process is
// left to receive the message.
export const closedBeforeDelivery = "The assigned agent session closed before delivery.";

// The sentence for a check notice whose agent had no running process when
// the dispatcher looked. The person reads the checks on the page, so the
// notice waits for no later start.
export const notRunningForCheck = "The agent was not running when its pull request checks changed.";

// The sentence for a check notice that a newer commit, a newer notice, or a
// merged or closed pull request replaced before the send.
export const supersededCheck = "A newer commit or a newer check result replaced this notice before delivery.";
