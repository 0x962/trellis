import type { Context } from "hono";
import { buildOpenApiDocument, type OpenApiBuild } from "../openapi.ts";

const SPEC_PATH = "/api/openapi.json";

// Scalar renders the spec in the browser. The script comes from the CDN;
// the page itself carries only the spec URL.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>trellis API</title>
</head>
<body>
<div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
<script>Scalar.createApiReference("#app", { url: "${SPEC_PATH}" });</script>
</body>
</html>
`;

// GET /api/openapi.json and GET /api/docs. The document is built on the
// first request and kept for the life of the process.
export const docsRoutes = () => {
	let built: Promise<OpenApiBuild> | undefined;
	const build = () => {
		built ??= buildOpenApiDocument();
		return built;
	};
	return {
		spec: async (c: Context) => c.json((await build()).document),
		docs: (c: Context) => c.html(page),
	};
};
