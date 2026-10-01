# Storybook

Storybook shows the real Trellis components with synthetic data. It runs separately from the desktop application and the server.

Run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run storybook
```

Open `http://127.0.0.1:6006`. Select a component or page in the sidebar. Each named story selects a state. Use Controls to change props. Use the toolbar to select the theme, phone width, or desktop width. The Accessibility panel checks the rendered story.

The catalog has three main groups:

- Components contains the public UI library, review controls, terminal surface, and desktop chrome.
- Overlays contains application dialogs, dropdowns, filters, menus, and popovers.
- Pages contains complete content views, sheets, navigation, settings, and setup.

An interactive story contains the supported transitions of its component. Its description identifies the action that opens the next state. A loading or error story uses a local fixture for that state.

## Data boundaries

The preview uses an isolated query cache and a memory router. The Storybook loader waits for the memory router before it renders a story. Controls and toolbar updates retain the current router and query cache. A new story or Reload story resets the application stores and creates a fresh environment. The synthetic actor is `Storybook`.

Story parameters supply local procedure responses:

```tsx
parameters: {
	trellis: {
		path: "/p/DEMO",
		responses: {
			"projects.list": [project],
			"projects.get": project,
			"projects.update": async (input) => ({ ...project, ...input }),
		},
	},
}
```

A response function receives the input and an optional abort signal. It can return a promise or throw an error. An unspecified procedure fails with its name. The preview blocks live API requests, external fetches, runtime sockets, and event streams. Page viewers use local documents. Terminal stories use local transports.

Stories for file routes also set `route` and `routePath`. These values register the route hooks with the memory router. Set `loadRoute: false` when a story renders a loading state directly. Set `actor: null` for the first setup screen.

Product actions in the catalog change local state or use declared response fixtures. They do not change a Trellis project or launch an agent.

## Checks

```sh
bun run storybook:check
bun run storybook:typecheck
bun run storybook:build
bun run storybook:test
```

The coverage check reads every CSF story and every `coverage*.json` file. It checks story references, source paths, duplicate IDs, file length, public UI exports, and application routes. A new public component or route needs a coverage record. Each record identifies its source, export, stories, states, and composition details.

The browser check requires a running Storybook and a Playwright Chromium installation. Run `bunx playwright install chromium` once, or set `STORYBOOK_BROWSER=chrome` to use an installed Chrome binary. Each story gets a new document with clear storage and cookies. The check applies the declared viewport before rendering and waits for the play action and final Storybook result. A missing fixture, render failure, or failed play action fails the check.

The complete browser check also verifies Controls, the theme toolbar, the 320 pixel viewport, and the documentation page. It checks that a story change restores the synthetic actor. A filtered run checks only its selected stories.

The Storybook GitHub workflow runs the coverage, type, lint, fixture, build, and browser checks for frontend changes. Its artifact retains the browser results and server log.

Optional environment variables:

- `STORYBOOK_URL` selects the running catalog. The default is `http://127.0.0.1:6006`.
- `STORYBOOK_FILTER` selects IDs that contain the supplied text.
- `STORYBOOK_RESULTS` writes the full JSON result to a file.

The static build writes `apps/web/storybook-static`. It contains no server connection. Run `bun run storybook:serve` to serve the build on `http://127.0.0.1:6006`. Use `STORYBOOK_DIRECTORY` and `STORYBOOK_PORT` to select another build directory or port. Stop the server after verification.

Trellis Pages can hold screenshots and coverage reports. Their frame policy does not support the Storybook application. Use the development server or the static server for the interactive catalog.

## Add a story

Use CSF with `Meta` and `StoryObj` from `@storybook/react-vite`. Import interaction helpers from `storybook/test`. Render the product component and preserve its normal props and behavior. Keep fixtures inside the catalog.

Add a named story for each supported state. Include empty, loading, error, disabled, selected, expanded, pending, success, long content, and narrow layouts where they apply. Use the real interaction for a state that the component owns internally. Include compound components in their parent story and name that relationship in the coverage record.

Bind controlled props to local state and connect their change callbacks. A fixed value with an empty callback prevents interaction.

A play function runs when a person opens its story. Keep the final visible state consistent with the story name. Use a separate interaction story, or restore the named state after the assertions.

Add the coverage entry to the matching `coverage*.json` file. Keep each file below 300 lines. Check the catalog after a component or route changes.
