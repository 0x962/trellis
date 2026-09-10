import type { Sort } from "@trellis/api";

// A board column lists the ticket that changed last at the top. The board
// query, the "show more" page under a column, and the footer under a board
// all read this sort.
export const boardSort: Sort = "-updatedAt";

// The footer text under a board. The table's default sort carries the
// priority as well, so a board names its own order.
export const boardSortLabel = "Sorted by the last update";
