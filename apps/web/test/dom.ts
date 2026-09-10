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

// bun prints the received value when an expectation fails. A DOM node reaches
// the React fiber graph, the query cache, and the window behind it, so
// printing one costs about a second, and a `waitFor` that polls a failing
// assertion spends its whole budget on the message. A node prints as its own
// tag and attributes instead. Testing Library formats its own DOM output, so
// a query failure still names the tree it searched.
const inspect = Symbol.for("nodejs.util.inspect.custom");
Object.defineProperty(Node.prototype, inspect, {
	value(this: Node) {
		if (!(this instanceof Element)) return this.nodeName;
		const attributes = [...this.attributes].map((attribute) => ` ${attribute.name}="${attribute.value}"`).join("");
		return `<${this.tagName.toLowerCase()}${attributes}>`;
	},
	configurable: true,
	writable: true,
});
