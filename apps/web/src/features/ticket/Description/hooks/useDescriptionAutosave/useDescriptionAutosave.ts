import { realScheduler, type Scheduler, type Ticket } from "@trellis/api";
import { useCallback, useEffect, useRef } from "react";

// The quiet time after the last keystroke before the description saves.
export const autosaveDelayMs = 800;

export type DescriptionAutosaveOptions = {
	ticket: Ticket;
	// Runs the write with the markdown and the version the row had.
	save: (markdown: string, expectedVersion: number) => Promise<void>;
	scheduler?: Scheduler;
};

// Saves the description 800 ms after the last change, or at once on blur.
// Every change restarts the window, so a burst of typing saves once. The
// version sent is the row's version at the moment of the save.
export const useDescriptionAutosave = ({ ticket, save, scheduler = realScheduler }: DescriptionAutosaveOptions) => {
	const pending = useRef<string | null>(null);
	const timer = useRef<unknown>(undefined);
	const version = useRef(ticket.version);
	version.current = ticket.version;

	const clear = useCallback(() => {
		if (timer.current !== undefined) scheduler.clearTimeout(timer.current);
		timer.current = undefined;
	}, [scheduler]);

	const flush = useCallback(() => {
		clear();
		const markdown = pending.current;
		if (markdown === null) return;
		pending.current = null;
		void save(markdown, version.current);
	}, [clear, save]);

	const onChange = useCallback(
		(markdown: string) => {
			pending.current = markdown;
			clear();
			timer.current = scheduler.setTimeout(flush, autosaveDelayMs);
		},
		[clear, flush, scheduler],
	);

	useEffect(() => flush, [flush]);

	return { onChange, onBlur: flush };
};
