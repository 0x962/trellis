import { statusText, type TicketAnswerOutput } from "@trellis/api";

export type AnswerResult = TicketAnswerOutput & { option: number };

const indentedRows = (rows: string[]): string[] => (rows.length === 0 ? ["  nothing"] : rows.map((row) => `  ${row}`));

export const answerText = (result: AnswerResult): string =>
	`${[
		`ticket: ${result.ticket.identifier}`,
		`option: ${result.option}`,
		`status: ${statusText({ status: result.ticket.status.category, isQuestion: false })}`,
		`commentId: ${result.commentId}`,
		"releases:",
		...indentedRows(result.ticket.releases.map((ticket) => `${ticket.identifier}  ${ticket.title}`)),
		"deliveries:",
		...indentedRows(
			result.deliveries.map((delivery) => `${delivery.ticket}  ${delivery.agentName}  ${delivery.runId}`),
		),
	].join("\n")}\n`;
