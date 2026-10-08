import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionStatusPane } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const latest = {
	id: "update-2",
	sessionId: "session-1",
	runId: "run-1",
	requestId: null,
	body: "The build checks pass. The review needs a human decision.",
	embeds: [],
	createdAt: "2026-09-30T12:00:00Z",
};
const previous = {
	...latest,
	id: "update-1",
	body: "The agent reviews the project view.",
	createdAt: "2026-09-29T12:00:00Z",
};
const meta = {
	title: "Components/SessionStatusPane",
	component: SessionStatusPane,
	args: {
		updates: { latest, previous, request: null, history: [latest, previous] },
		processState: "active",
		now: "2026-09-30T12:05:00Z",
		renderMarkdown: (body) => <p className="whitespace-pre-wrap">{body}</p>,
		onOpenLink: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Select an update to inspect its text. Arrow keys move tree focus and fold days. Load and retry append older fixture updates.",
			},
		},
	},
	render: function Render(args) {
		const [updates, setUpdates] = useStoryState(args.updates);
		const [historyControl, setHistoryControl] = useStoryState(args.historyControl);
		const load = () => {
			const history = updates.history ?? [updates.latest, updates.previous].filter((update) => update !== null);
			setUpdates({
				...updates,
				history: [
					...history,
					{ ...previous, id: "update-0", body: "The agent reads the release plan.", createdAt: "2026-09-28T12:00:00Z" },
				],
			});
			setHistoryControl(undefined);
		};
		return (
			<div className="flex h-160">
				<SessionStatusPane
					{...args}
					updates={updates}
					historyControl={historyControl && { ...historyControl, load, retry: load }}
				/>
			</div>
		);
	},
} satisfies Meta<typeof SessionStatusPane>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Resizable: Story = {
	render: function Render(args) {
		const [width, setWidth] = useState<number | null>(null);
		return (
			<div className="flex h-160 justify-end">
				<SessionStatusPane {...args} resize={{ width, onWidthChange: setWidth }} />
			</div>
		);
	},
};
export const Empty: Story = { args: { updates: { latest: null, previous: null, request: null } } };
export const Paused: Story = { args: { processState: "paused" } };
export const Completed: Story = { args: { processState: "completed" } };
export const Pending: Story = {
	args: {
		updates: {
			latest,
			previous,
			request: { requestId: "request", requestedAt: "2026-09-30T12:04:00Z", state: "pending", error: null },
		},
	},
};
export const Sent: Story = {
	args: {
		updates: {
			latest,
			previous,
			request: { requestId: "request", requestedAt: "2026-09-30T12:04:00Z", state: "sent", error: null },
		},
	},
};
export const RequestFailed: Story = {
	args: {
		updates: {
			latest,
			previous,
			request: {
				requestId: "request",
				requestedAt: "2026-09-30T12:04:00Z",
				state: "failed",
				error: "The update request failed.",
			},
		},
	},
};
export const ObserverError: Story = { args: { observerError: "The observer request failed." } };
export const HistoryLoading: Story = {
	args: { historyControl: { hasMore: true, loading: true, error: false, load: () => {}, retry: () => {} } },
};
export const HistoryError: Story = {
	args: { historyControl: { hasMore: true, loading: false, error: true, load: () => {}, retry: () => {} } },
};
export const HistoryAvailable: Story = {
	args: { historyControl: { hasMore: true, loading: false, error: false, load: () => {}, retry: () => {} } },
};
export const RetryHistory: Story = {
	args: { ...HistoryError.args },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Retry history" }));
		await expect(canvas.queryByRole("button", { name: "Retry history" })).not.toBeInTheDocument();
		await expect(canvas.queryByRole("button", { name: "Load older updates" })).not.toBeInTheDocument();
		await expect(canvas.getByText("The agent reads the release plan.")).toBeVisible();
	},
};
export const WithEmbed: Story = {
	args: {
		updates: {
			latest: { ...latest, embeds: [{ title: "Build report", html: "<h1>Build report</h1><p>All checks pass.</p>" }] },
			previous,
			request: null,
		},
	},
};
export const LongHistory: Story = {
	args: {
		updates: {
			latest,
			previous,
			request: null,
			history: Array.from({ length: 80 }, (_, index) => ({
				...latest,
				id: `update-${index}`,
				body: `Status update ${index + 1}`,
				createdAt: new Date(Date.UTC(2026, 8, 30, 12, -index)).toISOString(),
			})),
		},
	},
};
