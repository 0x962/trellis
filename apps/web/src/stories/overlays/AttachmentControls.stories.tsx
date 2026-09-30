import type { Meta, StoryObj } from "@storybook/react-vite";
import { fireEvent, within } from "storybook/test";
import { DropTarget } from "../../features/attachments/DropTarget";
import { UploadProgress } from "../../features/attachments/UploadProgress";
import { noop } from "./fixtures";

const upload = {
	id: "storybook-upload",
	file: new File(["Catalog notes"], "catalog.txt", { type: "text/plain" }),
	status: "pending" as const,
	percent: 0,
	error: null,
};
const meta = {
	title: "Overlays/AttachmentControls",
	component: UploadProgress,
	args: { upload, onDismiss: noop, onRetry: noop },
} satisfies Meta<typeof UploadProgress>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const Uploading: Story = { args: { upload: { ...upload, status: "uploading" } } };
export const Complete: Story = { args: { upload: { ...upload, status: "complete", percent: 100 } } };
export const HiddenName: Story = { args: { upload: { ...upload, status: "uploading" }, showName: false } };
export const RetryError: Story = { args: { upload: { ...upload, error: { code: "UPLOAD_FAILED" } } } };
export const ArchivedError: Story = { args: { upload: { ...upload, error: { code: "PROJECT_ARCHIVED" } } } };
export const DropClosed: Story = {
	render: () => (
		<DropTarget identifier="DEMO-1" onFiles={noop}>
			<div className="p-8 text-sm text-fg-muted">Attach files to the ticket.</div>
		</DropTarget>
	),
};
export const DropOpen: Story = {
	...DropClosed,
	play: async ({ canvasElement }) => {
		const transfer = new DataTransfer();
		transfer.items.add(upload.file);
		fireEvent.dragOver(await within(canvasElement).findByRole("region", { name: "Attachments for DEMO-1" }), {
			dataTransfer: transfer,
		});
	},
};
