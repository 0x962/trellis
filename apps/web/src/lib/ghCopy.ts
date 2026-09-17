// The settings page, the sidebar footer, and the PR section read the shared
// table in `@trellis/api`, so the web and the CLI word one gh failure the
// same way.
export { ghCopy } from "@trellis/api";

// What a gh failure costs the reader, said once for every surface.
export const ghConsequence = "PR checks stay empty until gh answers.";
