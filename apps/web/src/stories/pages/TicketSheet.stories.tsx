import type { Meta, StoryObj } from "@storybook/react-vite";
import { TicketSheet } from "../../features/shell/PageSheetHost/components/TicketSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { failure, pending, ticket } from "./fixtures/project";
import { projectResponses } from "./fixtures/responses";
import { pullRequest, reviewResponses } from "./fixtures/review";
import { run, sessionResponses } from "./fixtures/session";
import { settingsResponses } from "./fixtures/settings";

const meta = {
	title: "Pages/Ticket sheet",
	component: TicketSheet,
	beforeEach: () => {
		pageSheetActions.openTicket(ticket.identifier);
	},
	parameters: { layout: "fullscreen", trellis: { path: "/search", responses: projectResponses } },
} satisfies Meta<typeof TicketSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Loading: Story = { parameters: { trellis: { responses: { "tickets.get": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "tickets.get": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const ReviewStack: Story = {
	beforeEach: () => {
		pageSheetActions.openPullRequest(pullRequest.url);
		pageSheetActions.setReviewTab("overview");
	},
	parameters: { trellis: { responses: reviewResponses } },
};
export const SessionStack: Story = {
	beforeEach: () => {
		pageSheetActions.openSession(run.id);
	},
	parameters: { trellis: { responses: sessionResponses } },
};
export const SettingsStack: Story = {
	beforeEach: () => {
		pageSheetActions.openSettings("account");
	},
	parameters: { trellis: { responses: settingsResponses } },
};
export const ProjectSettingsStack: Story = {
	beforeEach: () => {
		pageSheetActions.openProjectSettings({ project: "DEMO", section: "statuses" });
	},
	parameters: { trellis: { responses: settingsResponses } },
};
export const BrowserStack: Story = {
	beforeEach: () => {
		pageSheetActions.openBrowser("file:///storybook/reference.html");
	},
};
