import type { TicketPr } from "@trellis/api";

// The row gives the title all space between the pull request number and the checks ribbon.
export type PrRowCell = { key: "title"; text: string };

export const prRowCells = (pr: TicketPr): PrRowCell[] => [{ key: "title", text: pr.title }];

export const prPhoneCells = prRowCells;
