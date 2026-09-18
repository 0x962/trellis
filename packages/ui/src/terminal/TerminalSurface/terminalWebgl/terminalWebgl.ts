import type { WebglAddon } from "@xterm/addon-webgl";
import type { IDisposable, Terminal } from "@xterm/xterm";

type Schedule = { schedule: (callback: () => void) => number; cancel: (id: number) => void };

export const terminalWebgl = (
	terminal: Pick<Terminal, "loadAddon" | "refresh" | "rows">,
	create: () => WebglAddon,
	{ schedule = requestAnimationFrame, cancel = cancelAnimationFrame }: Partial<Schedule> = {},
) => {
	let addon: WebglAddon | null = null;
	let listeners: IDisposable[] = [];
	const release = () => {
		for (const listener of listeners) listener.dispose();
		listeners = [];
		addon?.dispose();
		addon = null;
	};
	const frame = schedule(() => {
		try {
			addon = create();
			listeners.push(
				addon.onContextLoss(() => {
					release();
					terminal.refresh(0, terminal.rows - 1);
				}),
			);
			let atlasPages = 0;
			listeners.push(
				addon.onAddTextureAtlasCanvas(() => {
					if (++atlasPages < 32) return;
					atlasPages = 0;
					// Each color variant uses texture space. Clear cached glyphs after the current glyph draw completes.
					queueMicrotask(() => addon?.clearTextureAtlas());
				}),
			);
			terminal.loadAddon(addon);
		} catch {
			// A browser can refuse a GPU context. Release the addon so xterm can use its DOM renderer.
			release();
			terminal.refresh(0, terminal.rows - 1);
		}
	});
	return () => {
		cancel(frame);
		release();
	};
};
