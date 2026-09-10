import { GlobalRegistrator } from "@happy-dom/global-registrator";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Testing Library reads `document` when it is imported, so the browser
// globals must exist before any other preload file or test file loads. The
// page has an origin, so a client built over `window.location.origin` forms
// a valid request URL.
// The same-origin policy is off: a test that spawns the fake server on
// 127.0.0.1 reads its health from this origin.
GlobalRegistrator.register({ url: "http://trellis.local/", settings: { fetch: { disableSameOriginPolicy: true } } });
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

Object.defineProperty(HTMLElement.prototype, Symbol.for("nodejs.util.inspect.custom"), {
	value(this: HTMLElement) {
		return this.outerHTML;
	},
});
