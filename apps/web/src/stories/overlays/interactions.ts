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

export const chooseAndReopen =
	(trigger: string, option: string | RegExp, search?: { label: string; value: string }) =>
	async (context: { canvasElement: HTMLElement }) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton(trigger)(context);
		if (search) await fillField(context.canvasElement, search.label, search.value);
		await userEvent.click(await body.findByRole("option", { name: option }));
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await clickButton(trigger)(context);
		await waitFor(() => expect(body.getByRole("option", { name: option })).toHaveAttribute("data-current", "true"));
	};
