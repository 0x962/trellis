import type { Density } from "../../stores/uiStore";

// The fixed row box per density. The virtualizer estimates with the same
// number, so a row never changes the scroll height. The route skeletons
// read these numbers too, so this module imports no component: a route's
// pending state must not load the row and its pickers.
export const rowHeights: Record<Density, number> = { comfortable: 36, compact: 32 };

// The row box below 768 px, where a row is two lines. On the epic table the
// second line holds one fact of the ticket, and the table draws no pull
// request line and no agent line, so every ticket takes 56 px.
export const phoneRowHeight = 56;

// The row box of one pull request under a ticket row, 768 px and up. It
// does not change with the density.
export const prRowHeight = 32;

// The row box of the agent line under a ticket row, 768 px and up. It does
// not change with the density.
export const agentLineHeight = 24;
