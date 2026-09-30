// Desktop rows, virtualizer estimates, and loading placeholders share this
// height to keep the scroll position stable when ticket data arrives.
export const desktopRowHeight = 36;

// The row box below 768 px, where a row is two lines. On the epic table the
// second line holds one fact of the ticket, and the table draws no pull
// request line and no agent line, so every ticket takes 56 px.
export const phoneRowHeight = 56;

// The row box of one pull request under a ticket row, 768 px and up. The
// virtualizer reserves this height before the line renders.
export const prRowHeight = 32;

// The least height of the agent line under a ticket row, 768 px and up:
// one 16 px line of words and 4 px above and below it. The virtualizer
// reserves this height before the line renders, then measures the line,
// because a long message wraps onto more lines.
export const agentLineHeight = 24;

// The box of a group header, 768 px and up. It stands taller than a row, so
// a wave header reads as the top of a block. The virtualizer reserves the
// same number, and `GroupHeader` draws it.
export const groupHeaderHeight = 44;
