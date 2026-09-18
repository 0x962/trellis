import { createContext, useContext } from "react";

export type PageSheetContextValue = {
	// The element in the header of the sheet that takes the title and the
	// actions of the page. It is null until the header mounts.
	topbar: HTMLElement | null;
	close: () => void;
};

export const PageSheetContext = createContext<PageSheetContextValue | null>(null);

// The `PageSheet` that holds the calling component, or null on a routed page.
export const usePageSheet = () => useContext(PageSheetContext);
