import type { Sort } from "@trellis/api";

// The board query and each continuation page need the same order to avoid duplicate or missing cards.
export const boardSort: Sort = "-createdAt";

export const boardSortLabel = "Sorted by creation time";
