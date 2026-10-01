import { expect, userEvent, waitFor, within } from "storybook/test";

export const clickButton =
	(name: string | RegExp) =>
	async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		const button = await body.findByRole("button", { name });
		await waitFor(() => expect(button).toBeEnabled());
		await userEvent.click(button);
	};

export const fillField = async (canvasElement: HTMLElement, label: string, value: string) => {
	const input = await within(canvasElement.ownerDocument.body).findByLabelText(label, {
		exact: true,
		selector: 'input,textarea,[contenteditable="true"]',
	});
	await userEvent.clear(input);
	await userEvent.type(input, value);
};
