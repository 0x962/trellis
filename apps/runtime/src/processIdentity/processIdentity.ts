import { platform } from "../platform/index.ts";

// This record remains readable after a release removes the executable file.
export const processIdentity = platform.processIdentity;
