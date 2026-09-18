import { expect, test } from "bun:test";
import { MuseSessionEvents } from "./mspEvents.ts";
import { MuseQuestions } from "./museQuestions.ts";

const parser = new MuseSessionEvents("session");
const pending = parser.parse({
	method: "userInput/request",
	params: {
		sessionId: "session",
		turnId: "turn",
		userInputId: "input",
		questions: [
			{
				id: "q",
				question: "Choose a color",
				options: [{ label: "Blue" }, { label: "Red" }],
				selection: { mode: "single" },
			},
		],
	},
})[0]!;

test("Muse keeps a question pending and sends one explicit answer", async () => {
	const questions = new MuseQuestions();
	questions.observe(pending);
	const calls: unknown[] = [];
	const client = {
		request: async (...args: unknown[]) => {
			calls.push(args);
			return {};
		},
	};
	await expect(
		questions.answer(client, "session", "input", [{ questionId: "q", selectedLabel: "Green" }], false),
	).rejects.toThrow("match");
	expect(calls).toHaveLength(0);
	await questions.answer(client, "session", "input", [{ questionId: "q", selectedLabel: "Blue" }], false);
	expect(calls).toMatchObject([
		[
			"userInput/answer",
			{ sessionId: "session", userInputId: "input", answers: [{ questionId: "q", selectedLabel: "Blue" }] },
		],
	]);
	await expect(questions.answer(client, "session", "input", [], true)).rejects.toThrow("no longer");
	questions.observe({ kind: "input-resolved", requestId: "input" });
	await expect(questions.answer(client, "session", "input", [], true)).rejects.toThrow("no longer");
});

test("Muse supports text answers, explicit decline, and settled notifications", async () => {
	const questions = new MuseQuestions();
	const calls: string[] = [];
	const client = {
		request: async (method: string) => {
			calls.push(method);
			return {};
		},
	};
	questions.observe(pending);
	await questions.answer(client, "session", "input", [{ questionId: "q", freeText: "Purple" }], false);
	for (const event of parser.parse({
		method: "userInput/settled",
		params: { sessionId: "session", userInputId: "input" },
	}))
		questions.observe(event);
	questions.observe(pending);
	await questions.answer(client, "session", "input", [], true);
	expect(calls).toEqual(["userInput/answer", "userInput/cancel"]);
});
