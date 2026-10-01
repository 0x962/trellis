import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { TicketView } from "../../features/ticket/TicketView";
import { actor, archivedProject, failure, pending, ticket, tickets, timestamp } from "./fixtures/project";
import { attachments } from "./fixtures/resources";
import { projectResponses } from "./fixtures/responses";
import { pullRequest } from "./fixtures/review";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Ticket",
	component: TicketView,
	args: { identifier: ticket.identifier },
	parameters: { layout: "fullscreen", trellis: { path: "/search", responses: projectResponses } },
} satisfies Meta<typeof TicketView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Attachments: Story = {
	parameters: {
		trellis: { responses: { "tickets.get": { ...ticket, attachments }, "attachments.list": attachments } },
	},
};
export const AttachmentPreview: Story = {
	...Attachments,
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Open attachment preview" }));
	},
};
export const LinkedPullRequest: Story = {
	parameters: {
		trellis: {
			responses: {
				"tickets.get": { ...ticket, prs: [{ ...pullRequest, source: "manual", linkedBy: actor, linkedAt: timestamp }] },
				"pullRequests.list": [{ ...pullRequest, source: "manual", linkedBy: actor, linkedAt: timestamp }],
			},
		},
	},
};
export const EmptySections: Story = {
	parameters: {
		trellis: { responses: { "tickets.get": { ...ticket, description: "", children: [], prs: [], attachments: [] } } },
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "tickets.get": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "tickets.get": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const LongContent: Story = {
	parameters: {
		trellis: {
			responses: {
				"tickets.get": {
					...ticket,
					title:
						"Preserve the complete ticket title, dependency context, and child ticket list when the task spans several product views",
					description: `${ticket.description}\n\n${Array.from({ length: 8 }, (_, index) => `## Acceptance check ${index + 1}\n\nThe page uses the shared controls. The ticket identifier remains visible. The description supports paragraphs, lists, and code.\n\n\`\`\`sh\nbun run lint\n\`\`\``).join("\n\n")}`,
				},
			},
		},
	},
};
export const Completed: Story = {
	parameters: { trellis: { responses: { "tickets.get": { ...ticket, ...tickets[4] } } } },
};
export const Archived: Story = {
	parameters: {
		trellis: {
			responses: {
				"projects.get": archivedProject,
				"projects.list": (input: { archived?: boolean }) => (input.archived ? [archivedProject] : []),
			},
		},
	},
};
