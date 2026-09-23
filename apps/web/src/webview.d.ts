interface HTMLWebViewElement {
	reload: () => void;
	// The address of the page the element shows now. The answer is "" from
	// the moment the element joins the document until the guest page
	// attaches, which takes about a second.
	getURL: () => string;
	// The step in the history of the page, counted from the page on screen:
	// -1 is the page before it and 1 is the page after it.
	canGoToOffset: (offset: number) => boolean;
	goToOffset: (offset: number) => void;
}
