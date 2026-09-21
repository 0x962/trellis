interface HTMLWebViewElement {
	reload: () => void;
	goBack: () => void;
	goForward: () => void;
	canGoBack: () => boolean;
	canGoForward: () => boolean;
	getURL: () => string;
}
