import type { TicketSummary } from "@trellis/api";
import { Row } from "../src/features/table/Row";
import { ticketSummary } from "./fixtures";
import { renderWithProviders } from "./renderWithProviders";

// The default visible columns of a project table with sub-projects.
export const columns = ["select", "priority", "id", "title", "status", "pr", "project", "actor", "updated"] as const;

export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const summary = (overrides: Record<string, unknown> = {}) => ticketSummary(overrides) as TicketSummary;

// One Row inside the providers, with `row()` and `cell(column)` readers.
export const mountRow = (ticket: TicketSummary, density: "comfortable" | "compact" = "comfortable") => {
	const view = renderWithProviders(
		<Row ticket={ticket} density={density} columns={[...columns]} viewedProject="CDE" />,
		{ path: "/p/CDE", actor: "navid" },
	);
	const row = () => {
		const element = document.querySelector<HTMLElement>('[role="row"]');
		if (element === null) throw new Error("Row rendered no [role=row] element");
		return element;
	};
	const cell = (column: string) => row().querySelector<HTMLElement>(`[role="gridcell"][data-column="${column}"]`)!;
	return { ...view, row, cell };
};
