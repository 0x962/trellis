import type { AgentRun } from "@trellis/api";
import type { TerminalFrame, TerminalTransport } from "@trellis/ui/terminal";
import "@trellis/ui/terminal";
import { expect, waitFor, within } from "storybook/test";
import {
	acquireTerminal,
	disposeTerminalIdentity,
} from "../../../../../../packages/ui/src/terminal/TerminalSurface/terminalRegistry";
import { type TerminalSessionState, terminalOutput } from "./sessionStates";

function sessionTransport(state: TerminalSessionState): TerminalTransport {
	let output: (frame: TerminalFrame) => Promise<void>;
	let offset = 0;
	let signal: AbortSignal;
	const write = async (text: string) => {
		const data = new TextEncoder().encode(text);
		const startOffset = offset;
		offset += data.byteLength;
		await output({ data, startOffset, nextOffset: offset, truncated: false });
	};
	return {
		follow: async (_offset, onOutput, onState, abortSignal) => {
			output = onOutput;
			signal = abortSignal;
			onState({
				connection: "open",
				controllable: state !== "unavailable",
				stopped: false,
				unavailableReason: state === "unavailable" ? "The process status is unavailable." : null,
			});
			await write(`Storybook session\r\n\r\n> Review the ticket layout.\r\n${terminalOutput[state]}\r\n> `);
			if (signal.aborted) return;
			await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
		},
		send: async (text) => {
			if (signal.aborted) return;
			await write(text === "\r" ? "\r\n> " : text);
		},
		resize: async () => {},
	};
}

export const prepareSessionTerminal = (run: AgentRun, state: TerminalSessionState) => async () => {
	const identity = JSON.stringify([run.id, run.terminalId, run.sessionId]);
	disposeTerminalIdentity(identity);
	const host = document.createElement("div");
	host.className = "terminal-canvas";
	document.body.append(host);
	const styles = getComputedStyle(host);
	const appearance = {
		fontFamily: styles.fontFamily,
		fontSize: Number.parseFloat(styles.fontSize),
		background: styles.backgroundColor,
		foreground: styles.color,
	};
	host.remove();
	const lease = acquireTerminal(identity, appearance, () => sessionTransport(state));
	await lease.ready;
	lease.release();
	return () => disposeTerminalIdentity(identity);
};

export const assertSessionTerminal =
	(state: TerminalSessionState) =>
	async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement);
		const status = state === "running" ? "working" : state === "completed" ? "done" : state.replaceAll("-", " ");
		await expect(await canvas.findByRole("img", { name: new RegExp(` · ${status}$`) })).toBeVisible();
		await waitFor(() =>
			expect(canvasElement.querySelector(".xterm-accessibility-tree")).toHaveTextContent(terminalOutput[state]),
		);
		await expect(canvasElement.querySelector(".terminal-surface")).toBeVisible();
	};
