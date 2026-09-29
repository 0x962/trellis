export type PageTabCommand = "new" | "close" | "reopen" | "next" | "previous";

const listeners = new Set<(command: PageTabCommand) => void>();

export const dispatchPageTabCommand = (command: PageTabCommand) => {
	for (const listener of listeners) listener(command);
};

export const onPageTabCommand = (listener: (command: PageTabCommand) => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
