import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PendingInput } from "@trellis/api";
import { QuestionForm } from "../../features/sessions/PendingQuestions/components/QuestionForm";
import { at, failure, noop, pending, responses, run } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const question = {
	id: "choice",
	question: "Which theme needs review?",
	options: [
		{ label: "Light", description: "Inspect the light palette." },
		{ label: "Dark", description: "Inspect the dark palette." },
	],
	multiple: false,
};
const request: PendingInput = {
	id: "question-1",
	kind: "question",
	title: "Review scope",
	blocking: true,
	sequence: 1,
	at,
	questions: [question],
};
const meta = {
	title: "Overlays/QuestionForm",
	component: QuestionForm,
	args: { run, request, open: true, onOpenChange: noop },
	parameters: { trellis: { responses: { ...responses, "agentRuns.answer": {} } } },
} satisfies Meta<typeof QuestionForm>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Or enter an answer", "Review both themes.");
	await clickButton("Send answer")(context);
};
export const Open: Story = {};
export const Multiple: Story = {
	args: { request: { ...request, questions: [{ ...question, multiple: true, minSelections: 1, maxSelections: 2 }] } },
};
export const FreeText: Story = { args: { request: { ...request, questions: [{ ...question, options: [] }] } } };
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		await fillField(canvasElement, "Or enter an answer", "Review both themes.");
	},
};
export const Pending: Story = { parameters: { trellis: { responses: { "agentRuns.answer": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.answer": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
export const Declined: Story = { play: clickButton("Decline") };
