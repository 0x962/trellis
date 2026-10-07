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

const resumedSession = terminalSession("running");
const pausedSession = {
	...session,
	run: { ...session.run, terminalId: resumedSession.run.terminalId },
};
let resumed = false;
let startInput: unknown;
let pauseInput: unknown;

export const ResumeAndTerminalInput: Story = {
	beforeEach: async () => {
		resumed = false;
		startInput = undefined;
		pauseInput = undefined;
		return prepareSessionTerminal(resumedSession.run, "running")();
	},
	parameters: {
		trellis: {
			responses: {
				...responsesForSession(session),
				"sessions.get": () => (resumed ? resumedSession : startInput ? pausedSession : session),
				"sessions.list": () => [resumed ? resumedSession : startInput ? pausedSession : session],
				"agentRuns.list": () => ({
					items: [(resumed ? resumedSession : startInput ? pausedSession : session).run],
					nextCursor: null,
				}),
				"sessions.start": (input: unknown) => {
					startInput = input;
					resumed = true;
					return resumedSession;
				},
				"agentRuns.pause": (input: unknown) => {
					pauseInput = input;
					resumed = false;
					return pausedSession.run;
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Resume session" }));
		await waitFor(() => expect(canvas.getByRole("button", { name: "Pause session" })).toBeEnabled());
		await expect(startInput).toEqual({ id: session.id });
		const terminal = await canvas.findByRole("textbox", { name: `Terminal input for ${run.name}` });
		await userEvent.type(terminal, "Continue with the table.");
		await waitFor(() =>
			expect(canvasElement.querySelector(".xterm-accessibility-tree")).toHaveTextContent("Continue with the table."),
		);
		await userEvent.keyboard("{Escape}{Escape}");
		await expect(await canvas.findByRole("heading", { level: 2, name: run.name })).toHaveFocus();
		await userEvent.click(await canvas.findByRole("button", { name: "Pause session" }));
		await expect(await canvas.findByText("The agent is paused")).toBeVisible();
		await expect(pauseInput).toEqual({ id: run.id });
	},
};
