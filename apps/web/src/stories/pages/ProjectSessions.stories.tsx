import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ProjectSessionsPage } from "../../features/sessions/ProjectSessionsPage";
import { archivedProject, failure, pending, project } from "./fixtures/project";
import { run, sessionResponses } from "./fixtures/session";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Project sessions",
	component: ProjectSessionsPage,
	args: { project },
	parameters: { layout: "fullscreen", trellis: { path: "/sessions/project/DEMO", responses: sessionResponses } },
} satisfies Meta<typeof ProjectSessionsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openSessionList(canvasElement: HTMLElement) {
	const page = within(canvasElement.ownerDocument.body);
	const opener = page.queryByRole("button", { name: "Session list" });
	if (opener) await userEvent.click(opener);
	const navigation = await page.findByRole("navigation", { name: "Project sessions" });
	await waitFor(() => expect(navigation).toBeVisible());
	return within(navigation);
}

async function closeSessionList(canvasElement: HTMLElement) {
	const page = within(canvasElement.ownerDocument.body);
	const dialog = page.queryByRole("dialog");
	if (dialog) {
		await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
		await waitFor(() => expect(dialog).not.toBeVisible());
	}
}

export const Populated: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const sessions = await openSessionList(canvasElement);
		await expect(await sessions.findByRole("button", { name: /^Review the ticket layout\b/ })).toBeVisible();
		await closeSessionList(canvasElement);
		await expect(await canvas.findByRole("region", { name: "Review the ticket layout conversation" })).toBeVisible();
	},
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": { items: [], nextCursor: null }, "sessions.list": [] } } },
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": pending, "sessions.list": pending } } },
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": failure, "sessions.list": failure } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("button", { name: "Retry" })).toBeVisible();
		await expect(canvas.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
	},
};
export const ArchivedProject: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };

let refreshRequests = 0;
let refreshRecovers = false;

const refreshErrorResponses = {
	"agentRuns.list": () => {
		refreshRequests += 1;
		if (refreshRequests > 1 && !refreshRecovers) throw new Error("The synthetic refresh failed.");
		return sessionResponses["agentRuns.list"];
	},
};

export const RefreshError: Story = {
	beforeEach: () => {
		refreshRequests = 0;
		refreshRecovers = false;
	},
	parameters: { trellis: { responses: refreshErrorResponses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const sessions = await openSessionList(canvasElement);
		await expect(await sessions.findByText("The session list did not refresh", {}, { timeout: 10000 })).toBeVisible();
		await expect(await sessions.findByRole("button", { name: /^Review the ticket layout\b/ })).toBeVisible();
		await closeSessionList(canvasElement);
		await expect(await canvas.findByRole("region", { name: "Review the ticket layout conversation" })).toBeVisible();
	},
};

export const RefreshRecovery: Story = {
	...RefreshError,
	play: async (context) => {
		await RefreshError.play!(context);
		const canvas = within(context.canvasElement);
		refreshRecovers = true;
		const sessions = await openSessionList(context.canvasElement);
		await userEvent.click(await sessions.findByRole("button", { name: "Retry" }));
		await waitFor(() => expect(sessions.queryByText("The session list did not refresh")).not.toBeInTheDocument());
		await closeSessionList(context.canvasElement);
		await expect(await canvas.findByRole("region", { name: "Review the ticket layout conversation" })).toBeVisible();
	},
};
export const RefreshRecoveryNarrow: Story = {
	...RefreshRecovery,
	globals: { viewport: { value: "phone", isRotated: false } },
};

let listRecovers = false;

export const ListFailureWithConversation: Story = {
	beforeEach: () => {
		listRecovers = false;
	},
	parameters: {
		trellis: {
			responses: {
				"agentRuns.list": { items: [{ ...run, kind: "agent" }], nextCursor: null },
				"sessions.list": () => {
					if (!listRecovers) throw new Error("The synthetic session list failed.");
					return sessionResponses["sessions.list"];
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const sessions = await openSessionList(canvasElement);
		await expect(await sessions.findByText("Sessions did not load")).toBeVisible();
		const retry = await sessions.findByRole("button", { name: "Retry" });
		await expect(retry).toBeVisible();
		listRecovers = true;
		await userEvent.click(retry);
		await waitFor(() => expect(sessions.queryByText("Sessions did not load")).not.toBeInTheDocument());
		await closeSessionList(canvasElement);
		await expect(
			await within(canvasElement).findByRole("region", { name: "Review the ticket layout conversation" }),
		).toBeVisible();
	},
};

export const ListFailureWithConversationNarrow: Story = {
	...ListFailureWithConversation,
	globals: { viewport: { value: "phone", isRotated: false } },
};
export const KeyboardNavigation: Story = {
	play: async ({ canvasElement }) => {
		const sessions = await openSessionList(canvasElement);
		const page = within(canvasElement.ownerDocument.body);
		const row = await sessions.findByRole("button", { name: /^Review the ticket layout\b/ });
		const actions = await sessions.findByRole("button", { name: "Actions for Review the ticket layout" });
		row.focus();
		await userEvent.tab();
		await expect(actions).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		await userEvent.click(await page.findByRole("menuitem", { name: "Rename" }));
		await expect(await page.findByRole("textbox", { name: "Session name" })).toHaveFocus();
		const navigation = page.getByRole("navigation", { name: "Project sessions" });
		await expect(navigation.querySelector('[aria-hidden="true"] [tabindex="0"]')).toBeNull();
		await userEvent.tab({ shift: true });
		await expect(canvasElement.ownerDocument.activeElement?.closest('[aria-hidden="true"]')).toBeNull();
	},
};
