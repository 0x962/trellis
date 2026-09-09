import { GlobalRegistrator } from "@happy-dom/global-registrator";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Testing Library reads `document` when it is imported, so the browser
// globals must exist before any other preload file or test file loads.
GlobalRegistrator.register();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom's focus() ignores its options. Base UI returns focus to a
// trigger after an outside click only when the browser reads
// `focus({ preventScroll })`. It detects that support through a getter on
// the options object. Reading the option here makes happy-dom behave like
// every desktop browser.
const focus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (options?: FocusOptions) {
	void options?.preventScroll;
	focus.call(this);
};
