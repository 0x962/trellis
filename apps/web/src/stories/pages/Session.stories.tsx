import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentType } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SessionPage } from "../../features/sessions/SessionPage";
import { Route } from "../../routes/sessions.$id";
import { failure, pending, timestamp } from "./fixtures/project";
import { run, session, sessionResponses } from "./fixtures/session";
import {
	completedAfterExit,
	responsesForSession,
	type TerminalSessionState,
	terminalSession,
} from "./fixtures/sessionStates";
import { assertSessionTerminal, prepareSessionTerminal } from "./fixtures/sessionTerminal";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Session",
	component: SessionPage,
	args: { id: session.id },
	parameters: { layout: "fullscreen", trellis: { path: `/sessions/${session.id}`, responses: sessionResponses } },
} satisfies Meta<typeof SessionPage>;
export default meta;
type Story = StoryObj<typeof meta>;
const SessionError = Route.options.errorComponent as ComponentType<{ error: Error }>;

export const Paused: Story = {};
export const RequestError: Story = {
	render: () => <SessionError error={new Error("The session fixture is unavailable.")} />,
};
export const Starting: Story = {
	parameters: {
		trellis: { responses: { "sessions.get": { ...session, run: { ...run, state: "starting", processStatus: null } } } },
	},
};
export const Failed: Story = {
	parameters: {
		trellis: {
			responses: {
				"sessions.get": {
					...session,
					run: { ...run, state: "failed", error: "The synthetic agent process exits before startup completes." },
				},
			},
		},
	},
};
export const Archived: Story = {
	parameters: { trellis: { responses: { "sessions.get": { ...session, projectId: null, archivedAt: timestamp } } } },
};
export const Loading: Story = { parameters: { trellis: { responses: { "sessions.get": pending } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const LongName: Story = {
	parameters: {
		trellis: {
			responses: {
				"sessions.get": {
					...session,
					name: "Review the project board, table, ticket page, and every shared action at narrow screen widths",
				},
			},
		},
	},
};

const terminalStory = (state: TerminalSessionState, updates = false): Story => {
	const detail = terminalSession(state);
	return {
		parameters: { trellis: { responses: responsesForSession(detail, updates) } },
		beforeEach: prepareSessionTerminal(detail.run, state),
		play: assertSessionTerminal(state),
	};
};

export const Running: Story = terminalStory("running");
export const Idle: Story = terminalStory("idle");
export const Completed: Story = terminalStory("completed", true);
export const NeedsInput: Story = {
	...terminalStory("needs-input"),
	play: async (context) => {
		await assertSessionTerminal("needs-input")(context);
		await expect(await within(context.canvasElement).findByText("The agent needs a view choice.")).toBeVisible();
	},
};
export const Interrupted: Story = terminalStory("interrupted");
export const Unavailable: Story = terminalStory("unavailable");
export const RunningNarrow: Story = {
	...terminalStory("running"),
	globals: { viewport: { value: "phone", isRotated: false } },
};
export const CompletedAfterExit: Story = {
	parameters: { trellis: { responses: responsesForSession(completedAfterExit, true) } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("The agent is paused")).toBeVisible();
		await expect(
			await canvas.findByText("Review complete. The board and table checks pass.", { selector: "p" }),
		).toBeVisible();
		await expect(canvasElement.querySelector(".terminal-surface")).not.toBeInTheDocument();
	},
};
export const StatusUpdatesLoading: Story = {
	parameters: {
		trellis: { responses: { ...responsesForSession(completedAfterExit, true), "sessionUpdates.get": pending } },
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("Load agent status…")).toBeVisible();
	},
};
export const StatusUpdatesError: Story = {
	parameters: {
		trellis: { responses: { ...responsesForSession(completedAfterExit, true), "sessionUpdates.get": failure } },
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("The agent status did not load")).toBeVisible();
	},
};
export const StatusUpdatesEmpty: Story = {
	parameters: {
		trellis: {
			responses: {
				...responsesForSession(completedAfterExit, true),
				"sessionUpdates.get": { latest: null, previous: null, request: null, history: [], nextCursor: null },
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByText("The observer has not supplied a status update yet."),
		).toBeVisible();
	},
};

const message = "Continue with the table.";
const followUp = "Confirm retained context.";
const firstResume = terminalSession("running");
const secondResume = {
	...firstResume,
	run: { ...firstResume.run, terminalId: "storybook-terminal-next-resume" },
};
let currentSession = session;
let startInputs: unknown[] = [];
let pauseInput: unknown;
let acknowledged = "";
let submitted: string[] = [];
let inputIdentities: unknown[] = [];

export const ResumeAndTerminalInput: Story = {
	beforeEach: async () => {
		currentSession = session;
		startInputs = [];
		pauseInput = undefined;
		acknowledged = "";
		submitted = [];
		inputIdentities = [];
		const cleanups = await Promise.all(
			[firstResume, secondResume].map((detail) =>
				prepareSessionTerminal(detail.run, "running", {
					history: () => submitted.join("\r\n") || "Ready for input.",
					onAcknowledged: (text, userInput) => {
						if (!userInput) return;
						acknowledged += text;
						inputIdentities.push({
							id: detail.run.id,
							terminalId: detail.run.terminalId,
							sessionId: detail.run.sessionId,
						});
						if (text === "\r") submitted.push(acknowledged.split("\r").at(-2)!);
					},
				})(),
			),
		);
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	},
	parameters: {
		docs: {
			description: {
				story:
					"Synthetic terminal input acknowledgements and retained session identity. No provider receives this message.",
			},
		},
		trellis: {
			responses: {
				...responsesForSession(session),
				"sessions.get": () => currentSession,
				"sessions.list": () => [currentSession],
				"agentRuns.list": () => ({ items: [currentSession.run], nextCursor: null }),
				"sessions.start": (input: unknown) => {
					startInputs.push(input);
					currentSession = startInputs.length === 1 ? firstResume : secondResume;
					return currentSession;
				},
				"agentRuns.pause": (input: unknown) => {
					pauseInput = input;
					currentSession = { ...session, run: { ...session.run, terminalId: currentSession.run.terminalId } };
					return currentSession.run;
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const savedIdentity = { id: run.id, sessionId: run.sessionId, workspaceId: run.workspaceId, sessionLost: false };
		await expect(currentSession.run).toMatchObject(savedIdentity);
		await userEvent.click(await canvas.findByRole("button", { name: "Resume session" }));
		await waitFor(() => expect(canvas.getByRole("button", { name: "Pause session" })).toBeEnabled());
		await expect(startInputs).toEqual([{ id: session.id }]);
		await expect(currentSession.run).toMatchObject(savedIdentity);
		await expect(currentSession.run.terminalId).not.toBe(session.run.terminalId);
		const terminal = await canvas.findByRole("textbox", { name: `Terminal input for ${run.name}` });
		await userEvent.type(terminal, message);
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(acknowledged).toBe(`${message}\r`));
		await expect(submitted).toEqual([message]);
		await expect(inputIdentities).toHaveLength(message.length + 1);
		for (const identity of inputIdentities) {
			await expect(identity).toEqual({
				id: run.id,
				terminalId: firstResume.run.terminalId,
				sessionId: run.sessionId,
			});
		}
		await waitFor(() => expect(canvasElement.querySelector(".xterm-accessibility-tree")).toHaveTextContent(message));
		await userEvent.keyboard("{Escape}{Escape}");
		await expect(await canvas.findByRole("heading", { level: 2, name: run.name })).toHaveFocus();
		await userEvent.click(await canvas.findByRole("button", { name: "Pause session" }));
		await expect(await canvas.findByText("The agent is paused")).toBeVisible();
		await expect(pauseInput).toEqual({ id: run.id });
		await expect(currentSession.run).toMatchObject(savedIdentity);
		await expect(currentSession.run.terminalId).toBe(firstResume.run.terminalId);
		await userEvent.click(await canvas.findByRole("button", { name: "Resume session" }));
		await waitFor(() => expect(canvas.getByRole("button", { name: "Pause session" })).toBeEnabled());
		await expect(startInputs).toEqual([{ id: session.id }, { id: session.id }]);
		await expect(currentSession.run).toMatchObject(savedIdentity);
		await expect(currentSession.run.terminalId).toBe(secondResume.run.terminalId);
		await expect(currentSession.run.terminalId).not.toBe(firstResume.run.terminalId);
		await waitFor(() => expect(canvasElement.querySelector(".xterm-accessibility-tree")).toHaveTextContent(message));
		const nextTerminal = await canvas.findByRole("textbox", { name: `Terminal input for ${run.name}` });
		await userEvent.type(nextTerminal, followUp);
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(acknowledged).toBe(`${message}\r${followUp}\r`));
		await expect(submitted).toEqual([message, followUp]);
		await expect(inputIdentities).toHaveLength(message.length + followUp.length + 2);
		for (const identity of inputIdentities.slice(message.length + 1)) {
			await expect(identity).toEqual({
				id: run.id,
				terminalId: secondResume.run.terminalId,
				sessionId: run.sessionId,
			});
		}
		await userEvent.keyboard("{Escape}{Escape}");
		await expect(await canvas.findByRole("heading", { level: 2, name: run.name })).toHaveFocus();
		await expect(acknowledged).toBe(`${message}\r${followUp}\r`);
	},
};

export const ResumeAndTerminalInputNarrow: Story = {
	...ResumeAndTerminalInput,
	globals: { viewport: { value: "narrow", isRotated: false } },
};
