import { useMutation } from "@tanstack/react-query";
import type { AgentRun, InputAnswer, PendingInput } from "@trellis/api";
import { Button, Checkbox, Select, Sheet, Textarea } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

export function QuestionForm({
	run,
	request,
	open,
	onOpenChange,
}: {
	run: AgentRun;
	request: PendingInput;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { client, orpc, queryClient } = useApp();
	const [answers, setAnswers] = useState<Record<string, InputAnswer>>({});
	const [submitted, setSubmitted] = useState(false);
	const submit = useMutation({
		mutationFn: (cancel: boolean) =>
			client.agentRuns.answer({
				id: run.id,
				attemptId: run.terminalId!,
				requestId: request.id,
				answers: cancel ? [] : Object.values(answers),
				cancel,
			}),
		onSuccess: () => setSubmitted(true),
		onSettled: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.agentRuns.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.sessions.key() }),
			]),
	});
	const busy = submit.isPending || submitted;
	const complete = request.questions!.every((question) => {
		const answer = answers[question.id];
		if (!answer) return false;
		if (answer.freeText !== undefined) return answer.freeText.trim().length > 0;
		if (answer.selectedLabel !== undefined) return true;
		const count = answer.selectedLabels?.length ?? 0;
		return count >= (question.minSelections ?? 1) && count <= (question.maxSelections ?? question.options.length);
	});
	return (
		<Sheet title="Answer the agent" open={open} onOpenChange={onOpenChange}>
			<form
				className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
				onSubmit={(event) => {
					event.preventDefault();
					submit.mutate(false);
				}}
			>
				{request.questions!.map((question) => (
					<fieldset key={question.id} className="flex flex-col gap-3" disabled={busy}>
						<legend className="mb-2 text-sm font-medium text-fg">{question.question}</legend>
						{question.multiple && (
							<p className="text-xs text-fg-muted">
								Choose {question.minSelections ?? 1} to {question.maxSelections ?? question.options.length} options, or
								enter an answer.
							</p>
						)}
						{question.multiple
							? question.options.map((option) => (
									<Checkbox
										key={option.label}
										label={option.label}
										checked={answers[question.id]?.selectedLabels?.includes(option.label) ?? false}
										onCheckedChange={(checked) =>
											setAnswers((current) => ({
												...current,
												[question.id]: {
													questionId: question.id,
													selectedLabels: checked
														? [...(current[question.id]?.selectedLabels ?? []), option.label]
														: (current[question.id]?.selectedLabels ?? []).filter((value) => value !== option.label),
												},
											}))
										}
									/>
								))
							: question.options.length > 0 && (
									<Select
										label={question.question}
										placeholder="Choose an answer"
										value={answers[question.id]?.selectedLabel ?? ""}
										items={question.options.map((option) => ({ value: option.label, label: option.label }))}
										onValueChange={(selectedLabel) =>
											setAnswers((current) => ({
												...current,
												[question.id]: { questionId: question.id, selectedLabel },
											}))
										}
									/>
								)}
						{question.options.map(
							(option) =>
								option.description && (
									<p key={option.label} className="text-xs text-fg-muted">
										{option.label}: {option.description}
									</p>
								),
						)}
						<Textarea
							label={question.options.length ? "Or enter an answer" : "Your answer"}
							value={answers[question.id]?.freeText ?? ""}
							maxLength={500}
							onChange={(event) =>
								setAnswers((current) => ({
									...current,
									[question.id]: { questionId: question.id, freeText: event.target.value },
								}))
							}
						/>
					</fieldset>
				))}
				{submit.error && (
					<p role="alert" className="text-sm text-danger">
						{submit.error.message}
					</p>
				)}
				{submitted && (
					<p role="status" className="text-sm text-fg-muted">
						{submit.variables ? "Question declined. The agent will continue." : "Answer sent. The agent will continue."}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button type="button" disabled={busy} onClick={() => submit.mutate(true)}>
						Decline
					</Button>
					<Button type="submit" disabled={busy || !complete}>
						Send answer
					</Button>
				</div>
			</form>
		</Sheet>
	);
}
