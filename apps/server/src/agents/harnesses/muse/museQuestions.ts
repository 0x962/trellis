import { type InputAnswer, InputAnswerSchema } from "@trellis/api";
import type { HarnessEvent, HarnessInputRequest } from "@trellis/runtime-protocol";
import { z } from "zod";
import type { MspClient } from "./mspClient.ts";
import { uuid7 } from "./uuid7.ts";

export class MuseQuestions {
	private readonly requests = new Map<string, HarnessInputRequest>();
	private readonly submitted = new Set<string>();
	observe(event: HarnessEvent) {
		if (event.kind === "input-request") this.requests.set(event.inputRequest!.id, event.inputRequest!);
		if (event.kind === "input-resolved") {
			this.requests.delete(event.requestId!);
			this.submitted.delete(event.requestId!);
		}
		if (event.kind === "idle" || (event.kind === "error" && !event.willRetry)) {
			this.requests.clear();
			this.submitted.clear();
		}
	}
	async answer(
		client: Pick<MspClient, "request">,
		sessionId: string,
		id: string,
		answers: InputAnswer[],
		cancel: boolean,
	) {
		const request = this.requests.get(id);
		if (!request || this.submitted.has(id)) throw new Error("This question is no longer available for an answer.");
		z.array(InputAnswerSchema).parse(answers);
		if (!cancel) {
			if (
				answers.length !== request.questions!.length ||
				new Set(answers.map((answer) => answer.questionId)).size !== answers.length
			)
				throw new Error("Answer every question once.");
			for (const question of request.questions!) {
				const answer = answers.find((value) => value.questionId === question.id);
				if (
					!answer ||
					[answer.freeText, answer.selectedLabel, answer.selectedLabels].filter((value) => value !== undefined)
						.length !== 1
				)
					throw new Error("Choose an answer or enter text for each question.");
				if (answer.freeText !== undefined) {
					if (!answer.freeText.trim()) throw new Error("Enter an answer.");
					continue;
				}
				const labels = answer.selectedLabels ?? [answer.selectedLabel!];
				if (
					question.multiple !== (answer.selectedLabels !== undefined) ||
					labels.some((label) => !question.options.some((option) => option.label === label)) ||
					new Set(labels).size !== labels.length ||
					labels.length < (question.minSelections ?? 1) ||
					labels.length > (question.maxSelections ?? question.options.length)
				)
					throw new Error("The selected answers do not match the question.");
			}
		}
		this.submitted.add(id);
		await client.request(cancel ? "userInput/cancel" : "userInput/answer", {
			commandId: uuid7(),
			sessionId,
			userInputId: id,
			...(cancel ? {} : { answers }),
		});
	}
}
