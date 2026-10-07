import type { Meta, StoryObj } from "@storybook/react-vite";
import { setTheme } from "@trellis/ui";
import { TerminalSurface } from "@trellis/ui/terminal";
import { useEffect, useId } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { disposeTerminalIdentity } from "../../../../../../packages/ui/src/terminal/TerminalSurface/terminalRegistry";
import { localTransport } from "./localTransport";

const meta = {
	title: "Components/TerminalSurface",
	component: TerminalSurface,
	args: {
		identity: "storybook-terminal",
		label: "Local terminal",
		createTransport: () => localTransport("connected"),
		onLeave: () => {},
		onOpenLink: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"The transport echoes local input. It opens no network or runtime connection. Read-only, connection, buffer-gap, and stopped states use the real terminal.",
			},
		},
	},
	render: function Render(args) {
		const identity = useId();
		useEffect(() => () => disposeTerminalIdentity(identity), [identity]);
		return (
			<div className="flex h-100 flex-col bg-bg font-mono text-sm text-fg">
				<TerminalSurface {...args} identity={identity} />
			</div>
		);
	},
} satisfies Meta<typeof TerminalSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
export const ReadOnly: Story = { args: { readOnly: true } };
export const Connecting: Story = {
	args: { createTransport: () => localTransport("connecting") },
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("Connect terminal…")).toBeVisible();
	},
};
export const ErrorState: Story = {
	args: { createTransport: () => localTransport("error") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("The terminal disconnected")).toBeVisible();
		await expect(await canvas.findByRole("button", { name: "Reconnect terminal" })).toBeEnabled();
	},
};
export const Unavailable: Story = { args: { createTransport: () => localTransport("unavailable") } };
export const BufferGap: Story = { args: { createTransport: () => localTransport("gap") } };
export const Stopped: Story = { args: { stopped: true } };
export const Fill: Story = { args: { layout: "fill" } };

let initializationCount = 0;

export const InitializationRecovery: Story = {
	beforeEach: () => {
		initializationCount = 0;
	},
	args: {
		createTransport: () => {
			initializationCount += 1;
			if (initializationCount === 1) throw new Error("The synthetic terminal could not initialize.");
			return localTransport("connected");
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("The terminal did not load")).toBeVisible();
		const terminalBox = canvasElement.querySelector(".terminal-canvas")!;
		const initialBounds = terminalBox.getBoundingClientRect();
		await userEvent.click(await canvas.findByRole("button", { name: "Reconnect terminal" }));
		await waitFor(() =>
			expect(canvasElement.querySelector(".xterm-accessibility-tree")).toHaveTextContent("Local Storybook terminal"),
		);
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
		await expect(initializationCount).toBe(2);
		await expect(terminalBox.getBoundingClientRect().toJSON()).toEqual(initialBounds.toJSON());
	},
};

let connectionAttempts = 0;
let transportCount = 0;

export const ConnectionRecovery: Story = {
	beforeEach: () => {
		connectionAttempts = 0;
		transportCount = 0;
	},
	args: {
		createTransport: () => {
			transportCount += 1;
			const transport = localTransport("connected");
			return {
				...transport,
				follow: async (...input) => {
					connectionAttempts += 1;
					if (connectionAttempts === 1) throw new Error("The synthetic terminal connection failed.");
					return transport.follow(...input);
				},
			};
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("The terminal disconnected")).toBeVisible();
		const reconnect = await canvas.findByRole("button", { name: "Reconnect terminal" });
		(await canvas.findByRole("textbox", { name: "Local terminal" })).focus();
		await userEvent.tab();
		await expect(reconnect).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() =>
			expect(canvasElement.querySelector(".xterm-accessibility-tree")).toHaveTextContent("Local Storybook terminal"),
		);
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
		await expect(connectionAttempts).toBe(2);
		await expect(transportCount).toBe(1);
	},
};
export const InitializationRecoveryNarrow: Story = {
	...InitializationRecovery,
	globals: { viewport: { value: "narrow", isRotated: false } },
};

let themeTransportCount = 0;

export const ThemeSwitch: Story = {
	beforeEach: () => {
		themeTransportCount = 0;
	},
	args: {
		createTransport: () => {
			themeTransportCount += 1;
			return localTransport("connected");
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const terminal = await canvas.findByRole("textbox", { name: "Local terminal" });
		await userEvent.type(terminal, "Retained terminal input");
		const output = canvasElement.querySelector(".xterm-accessibility-tree")!;
		await waitFor(() => expect(output).toHaveTextContent("Retained terminal input"));
		setTheme("light");
		await waitFor(() =>
			expect(getComputedStyle(canvasElement.querySelector(".terminal-canvas")!).backgroundColor).toBe(
				"rgb(255, 255, 255)",
			),
		);
		await expect(canvas.getByRole("textbox", { name: "Local terminal" })).toBe(terminal);
		setTheme("dark");
		await waitFor(() =>
			expect(getComputedStyle(canvasElement.querySelector(".terminal-canvas")!).backgroundColor).toBe("rgb(7, 7, 7)"),
		);
		await expect(canvas.getByRole("textbox", { name: "Local terminal" })).toBe(terminal);
		await expect(output).toHaveTextContent("Retained terminal input");
		await expect(themeTransportCount).toBe(1);
	},
};
