import { afterEach } from "bun:test";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "@trellis/ui";

// Every query reaches the server of apps/server over an in-memory Postgres,
// so a page that waits on a handful of them takes longer than the one second
// Testing Library waits by default.
configure({ asyncUtilTimeout: 3000 });

// Every test file shares one document. A tree left mounted by one test would
// answer the queries of the next one. A toast lives in a module store that
// outlives the render, so the next Toaster raises it again; dismissing it
// takes it out of the store's active list.
afterEach(() => {
	cleanup();
	toast.dismiss();
});
