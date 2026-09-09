import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";

// Every test file shares one document. A tree left mounted by one test would
// answer the queries of the next one.
afterEach(cleanup);
