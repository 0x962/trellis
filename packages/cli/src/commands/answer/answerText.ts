import { statusText, type TicketAnswerOutput } from "@trellis/api";

export type AnswerResult = TicketAnswerOutput & { option: number };

const indentedLines = (lines: string[]): string[] =>
	lines.length === 0 ? ["  nothing"] : lines.map((line) => `  ${line}`);

export const answerText = (result: AnswerResult): string =>
	`${[
		`ticket: ${result.ticket.identifier}`,
		`option: ${result.option}`,
		`status: ${statusText({ status: result.ticket.status.category, isQuestion: true })}`,
		`answerId: ${result.answerId}`,
		"releases:",
		...indentedLines(result.ticket.releases.map((ticket) => `${ticket.identifier}  ${ticket.title}`)),
		"deliveries:",
		...indentedLines(
			result.deliveries.map((delivery) => `${delivery.ticket}  ${delivery.agentName}  ${delivery.runId}`),
		),
	].join("\n")}\n`;
