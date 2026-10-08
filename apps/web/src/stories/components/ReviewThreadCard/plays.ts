import { expect, userEvent, within } from "storybook/test";

type Canvas = { canvasElement: HTMLElement };

export async function submitReply({ canvasElement }: Canvas) {
	const canvas = within(canvasElement);
	const reply = await canvas.findByRole("textbox", { name: "Reply" });
	await userEvent.clear(reply);
	await userEvent.type(reply, "The change preserves the selection.");
	await userEvent.click(canvas.getByRole("button", { name: "Post reply" }));
}

export async function resolveThread({ canvasElement }: Canvas) {
	await userEvent.click(await within(canvasElement).findByRole("button", { name: "Resolve comment" }));
}

export async function openEdit({ canvasElement }: Canvas) {
	const canvas = within(canvasElement);
	await userEvent.click((await canvas.findAllByRole("button", { name: "Edit message" }))[0]!);
	await expect(await canvas.findByRole("textbox", { name: "Edit message" })).toBeVisible();
}

export async function submitEdit(context: Canvas) {
	await openEdit(context);
	const canvas = within(context.canvasElement);
	await userEvent.clear(canvas.getByRole("textbox", { name: "Edit message" }));
	await userEvent.type(canvas.getByRole("textbox", { name: "Edit message" }), "Retain all selected tickets.");
	await userEvent.click(canvas.getByRole("button", { name: "Save" }));
}
