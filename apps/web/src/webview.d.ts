interface HTMLWebViewElement {
	reload: () => void;
	getURL: () => string;
	// The step in the history of the page, counted from the page on screen:
	// -1 is the page before it and 1 is the page after it.
	canGoToOffset: (offset: number) => boolean;
	goToOffset: (offset: number) => void;
}
