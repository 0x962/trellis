import { expect, test } from "bun:test";
import type { TicketAnswerOutput } from "@trellis/api";
import type { CliContext } from "../../context.ts";
import { answerInput } from "./answer.ts";
import { answerText } from "./answerText.ts";

const output = (fields: Partial<TicketAnswerOutput> = {}): TicketAnswerOutput =>
	({
		ticket: {
			identifier: "OP-52",
			title: "Run a missed window late or leave it missed",
			status: { category: "done" },
			releases: [
				{
					identifier: "OP-33",
					title: "One routine failure does not end the sweep pass",
				},
			],
		},
		answerId: "01M30E70H4Y03NV9TX8NY3CME1",
		deliveries: [
			{
				ticket: "OP-33",
				agentName: "crisp-fjord",
				runId: "01M30E7AHK9NYH32XJQ7FZF8BP",
			},
		],
		...fields,
	}) as TicketAnswerOutput;

const context = (stdin: string): CliContext =>
	({
		deps: { stdin: () => Promise.resolve(stdin) },
	}) as CliContext;

test("builds the answer input from both free text and standard input", async () => {
	await expect(
		answerInput(context("unused"), { ticket: "OP-52", option: "1", reason: "The narrow option." }),
	).resolves.toEqual({
		ticket: "OP-52",
		option: 1,
		reason: "The narrow option.",
	});
	await expect(
		answerInput(context("The piped reason."), { ticket: "OP-52", option: "2", reason: "-" }),
	).resolves.toEqual({
		ticket: "OP-52",
		option: 2,
		reason: "The piped reason.",
	});
});

test("refuses option text that is not an integer", async () => {
	await expect(answerInput(context("unused"), { ticket: "OP-52", option: "abc", reason: "A reason." })).rejects.toThrow(
		"--option needs an integer",
	);
	await expect(answerInput(context("unused"), { ticket: "OP-52", option: "1e3", reason: "A reason." })).rejects.toThrow(
		"--option needs an integer",
	);
});

test("prints the answer, status, released tickets, and deliveries", () => {
	expect(answerText({ ...output(), option: 1 })).toBe(`ticket: OP-52
option: 1
status: done
answerId: 01M30E70H4Y03NV9TX8NY3CME1
releases:
  OP-33  One routine failure does not end the sweep pass
deliveries:
  OP-33  crisp-fjord  01M30E7AHK9NYH32XJQ7FZF8BP
`);
});

test("prints empty release and delivery fields", () => {
	expect(
		answerText({
			...output({ ticket: { ...output().ticket, releases: [] }, deliveries: [] }),
			option: 2,
		}),
	).toBe(`ticket: OP-52
option: 2
status: done
answerId: 01M30E70H4Y03NV9TX8NY3CME1
releases:
  nothing
deliveries:
  nothing
`);
});
