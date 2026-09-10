import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";
import { toast } from "@trellis/ui";

// Every test file shares one document. A tree left mounted by one test would
// answer the queries of the next one. A toast lives in a module store that
// outlives the render, so the next Toaster raises it again; dismissing it
// takes it out of the store's active list.
afterEach(() => {
	cleanup();
	toast.dismiss();
});
