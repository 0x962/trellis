import type { Sort } from "@trellis/api";

// A board shows each column in the manual card order. The board query and
// the footer under a board both read this sort.
export const boardSort: Sort = "position";
