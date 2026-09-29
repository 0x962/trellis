import { flowV1FixtureIds } from "../../../../packages/api/src/schemas/flowV1Fixtures.ts";

export const narrowFrame = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Actual editor at 320 pixels</title>
<style>html,body{margin:0}iframe{display:block;width:320px;height:800px;border:0}</style>
<iframe title="Actual Langflow editor at 320 pixels" src="/flow/${flowV1FixtureIds.flow}/"></iframe>
</html>`;
