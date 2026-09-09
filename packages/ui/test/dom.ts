import { GlobalRegistrator } from "@happy-dom/global-registrator";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Testing Library reads `document` when it is imported, so the browser
// globals must exist before any other preload file or test file loads.
GlobalRegistrator.register();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
