# Native mobile Boxd proof path

## Result

Use two separate evidence lanes for the native mobile journey.

1. Use Expo Web and Playwright on Boxd for repeatable browser evidence.
2. Use an Android device or an Android-enabled Boxd image for native evidence.

The current Boxd machine can complete the browser lane. It cannot complete the native lane. The machine has no Android SDK, `adb`, or emulator. The `boxd` user also has no read or write access to `/dev/kvm`. Linux cannot run an iOS simulator.

Do not claim native proof from Expo Web screenshots. The browser lane uses React Native Web and a temporary storage adapter. It does not use the Android or iOS renderers.

## Sources

This report uses these sources as of 2026-10-07 UTC:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/UI_PATTERNS.md`
- `apps/mobile/`
- `reports/native-mobile-baseline.md` from TRL-1344
- The TRL-1334 and TRL-1386 ticket proof criteria
- [Expo SQLite web setup](https://docs.expo.dev/versions/latest/sdk/sqlite/)

The proof method does not depend on competitor evidence. It uses the Trellis baseline and the ticket proof criteria.

The pilot uses source `e0f0450215d603def5728d343347908a5ade43b3`.

## Route inventory

The current mobile route tree contains these journeys:

| Route | Journey |
| --- | --- |
| `/setup` | Enter a server URL, scan a pair code, test the connection, enter a name, and save. |
| `/pair` | Read a pair link and forward its URL to setup. |
| `/(projects)/projects` | Read projects and open a project. |
| `/(projects)/project/[ref]` | Read a project ticket list and open a ticket. |
| `/(search)/search` | Search tickets, use recent searches, and open a ticket. |
| `/(settings)/settings` | Read the server and name, change the theme, and reopen setup. |
| `/(search,projects,settings)/ticket/[identifier]` | Read and update one ticket from each tab stack. |

The final fixture must cover the nested ticket route from all three tab stacks. This check proves that each tab keeps its own navigation history.

## Selected browser lane

The browser lane uses these parts:

- Bun 1.3.13, which matches the repository package manager.
- Exact no-save packages `react-native-web@0.21.2` and `@expo/metro-runtime@57.0.15`.
- The installed Playwright 1.63.0 package.
- A temporary Chromium download under the ticket run directory.
- A temporary Metro config outside `apps/mobile`.
- A temporary browser storage adapter.
- A static Expo Web export.
- A local static server with COOP and COEP headers.
- Playwright route fixtures with synthetic data.

The browser storage adapter implements the synchronous `SQLiteStorage` methods that `apps/mobile/src/lib/kv.ts` uses. It stores values in `localStorage`. It lets the browser render and retain fixture state across a reload.

This adapter is a browser fixture. It does not prove SQLite behavior.

### Why the adapter is required

The default web export stops before it creates a bundle because the mobile package omits `react-native-web`.

A no-save install reaches the next failure. Metro does not resolve `expo-sqlite/web/wa-sqlite/wa-sqlite.wasm` because the mobile Metro config omits `wasm` from `assetExts`.

A temporary Metro change resolves the WASM file. Chromium 153 then stops during the first synchronous SQLite read with `Sync operation timeout`. The error starts in `SQLiteStorage.getItemSync` before the route renders.

The temporary storage adapter removes that browser-only startup failure. Product source, `apps/mobile/package.json`, and `bun.lock` stay unchanged.

## Repeatable Boxd commands

Run all commands on the assigned Boxd machine. Do not run these commands on the Mac.

### 1. Check the machine

```sh
set -eu

trl1386_worktree=/home/boxd/worktrees/trl-1386
trl1386_run=/tmp/trellis-trl1386

cd "$trl1386_worktree"
git fetch origin main
test -z "$(git status --porcelain)"

trl1386_source="$(git rev-parse HEAD)"
printf "source=%s\n" "$trl1386_source"

df -h "$trl1386_worktree" /tmp
free -h
uptime
id
ls -l /dev/kvm
command -v xcrun || true
command -v adb || true
command -v emulator || true
```

The final browser run needs at least 2 GiB of free space. The Chromium download used 304 MiB in this pilot.

### 2. Use the repository Bun version

```sh
set -eu

mkdir -p "$trl1386_run/bin"
curl -fsSL \
  https://github.com/oven-sh/bun/releases/download/bun-v1.3.13/bun-linux-x64.zip \
  -o "$trl1386_run/bun.zip"
unzip -q -o "$trl1386_run/bun.zip" -d "$trl1386_run/bin"

trl1386_bun="$trl1386_run/bin/bun-linux-x64/bun"
test "$("$trl1386_bun" --version)" = "1.3.13"
```

### 3. Install only temporary browser dependencies

```sh
set -eu

cd "$trl1386_worktree"
sha256sum apps/mobile/package.json bun.lock > "$trl1386_run/deps-before.sha256"

"$trl1386_bun" install --frozen-lockfile
"$trl1386_bun" add --no-save --cwd apps/mobile \
  react-native-web@0.21.2 \
  @expo/metro-runtime@57.0.15

PLAYWRIGHT_BROWSERS_PATH="$trl1386_run/browsers" \
  "$trl1386_bun" x playwright install chromium

sha256sum apps/mobile/package.json bun.lock > "$trl1386_run/deps-after.sha256"
diff -u "$trl1386_run/deps-before.sha256" "$trl1386_run/deps-after.sha256"
```

The final `diff` must have no output.

### 4. Create the temporary storage adapter

Write this file to `$trl1386_run/sqlite-kv-shim.js`:

```js
export class SQLiteStorage {
	constructor(name) {
		this.prefix = name + ":";
	}

	getItemSync(key) {
		return localStorage.getItem(this.prefix + key);
	}

	setItemSync(key, value) {
		localStorage.setItem(this.prefix + key, value);
	}

	removeItemSync(key) {
		const fullKey = this.prefix + key;
		const found = localStorage.getItem(fullKey) !== null;
		localStorage.removeItem(fullKey);
		return found;
	}

	getAllKeysSync() {
		const keys = [];
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (key?.startsWith(this.prefix)) keys.push(key.slice(this.prefix.length));
		}
		return keys;
	}

	clearSync() {
		for (const key of this.getAllKeysSync()) {
			localStorage.removeItem(this.prefix + key);
		}
		return true;
	}
}
```

### 5. Create the temporary Metro config

Write this file to `$trl1386_run/metro.config.cjs`:

```js
const config = require(process.env.TRL1386_PROJECT_METRO_CONFIG);

config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === "expo-sqlite/kv-store") {
		return {
			type: "sourceFile",
			filePath: process.env.TRL1386_SQLITE_SHIM,
		};
	}
	return defaultResolve
		? defaultResolve(context, moduleName, platform)
		: context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
```

`EXPO_OVERRIDE_METRO_CONFIG` is an internal option in the installed Expo CLI. Keep the Expo CLI version fixed for this proof. Recheck `node_modules/@expo/cli/build/src/start/server/metro/instantiateMetro.js` after an Expo update.

### 6. Export the browser fixture

```sh
set -eu

cd "$trl1386_worktree/apps/mobile"
rm -rf "$trl1386_run/web"

TRL1386_PROJECT_METRO_CONFIG="$trl1386_worktree/apps/mobile/metro.config.js" \
TRL1386_SQLITE_SHIM="$trl1386_run/sqlite-kv-shim.js" \
EXPO_OVERRIDE_METRO_CONFIG="$trl1386_run/metro.config.cjs" \
  "$trl1386_bun" x expo export \
  --platform web \
  --output-dir "$trl1386_run/web"
```

Keep the export outside the worktree. The export is a temporary test product.

### 7. Serve the export

The static server must send these headers on every response:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The Expo SQLite web guide requires these headers for shared memory. The pilot keeps them even though the storage adapter removes the SQLite worker.

A Bun static server can serve the export. It must return `index.html` for routes without a file extension.

Write this file to `$trl1386_run/serve.ts`:

```ts
const root = process.env.TRL1386_WEB_ROOT!;

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 4173,
	async fetch(request) {
		const url = new URL(request.url);
		const leaf = url.pathname.split("/").at(-1)!;
		const route = url.pathname === "/" || !leaf.includes(".");
		let file = Bun.file(root + (route ? "/index.html" : url.pathname));
		if (!(await file.exists())) file = Bun.file(root + "/index.html");
		return new Response(file, {
			headers: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp",
			},
		});
	},
});

console.log(server.url.href);
await new Promise(() => {});
```

```sh
set -eu

export TRL1386_WEB_ROOT="$trl1386_run/web"

nohup "$trl1386_bun" "$trl1386_run/serve.ts" \
  > "$trl1386_run/server.log" 2>&1 &
echo $! > "$trl1386_run/server.pid"

curl -fsSI http://127.0.0.1:4173/setup
```

The response must include both isolation headers.

### 8. Run the browser journeys

Use Playwright with these settings:

```ts
const context = await browser.newContext({
	viewport: { width: 320, height: 720 },
	colorScheme: "light",
	reducedMotion: "reduce",
	hasTouch: true,
	isMobile: true,
});
```

Use `page.route` for synthetic server replies. Do not start Trellis or copy live data.

Preseed the browser fixture with these storage keys when a journey starts past setup:

```ts
await context.addInitScript(() => {
	localStorage.setItem("trellis:trellis-server-url", "http://127.0.0.1:4522");
	localStorage.setItem("trellis:trellis-actor-name", "browser-proof");
});
```

Store all response fixtures in the Playwright script. Use long names, long descriptions, many rows, empty arrays, delayed replies, and explicit errors.

Record each step in a JSON result. Save a screenshot after each stable state. Fail the script for a browser console error, a page error, a failed request, a missing accessible name, or unexpected horizontal scroll.

This minimal script repeats the setup pilot. Write it to `$trl1386_run/pilot.ts`:

```ts
import { chromium } from "playwright";

const errors: string[] = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
	viewport: { width: 320, height: 720 },
	colorScheme: "light",
	reducedMotion: "reduce",
});
const page = await context.newPage();

page.on("console", (message) => {
	if (message.type() === "error") errors.push("console: " + message.text());
});
page.on("pageerror", (error) => errors.push("page: " + error.message));

const response = await page.goto("http://127.0.0.1:4173/setup", {
	waitUntil: "domcontentloaded",
	timeout: 20_000,
});
await page.getByText("Server URL", { exact: true }).waitFor({
	state: "visible",
	timeout: 20_000,
});

await page.keyboard.press("Tab");
const focused = await page.evaluate(() => {
	const element = document.activeElement;
	return {
		tag: element?.tagName ?? null,
		name:
			element?.getAttribute("aria-label") ??
			element?.getAttribute("name") ??
			null,
		placeholder: element?.getAttribute("placeholder") ?? null,
	};
});
const result = await page.evaluate(() => ({
	crossOriginIsolated,
	hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
	width: innerWidth,
	height: innerHeight,
	text: document.body.innerText,
	buttons: Array.from(document.querySelectorAll("button")).map((button) => ({
		name: button.innerText,
		disabled: button.disabled,
	})),
}));

await page.screenshot({
	path: process.env.TRL1386_SCREENSHOT!,
	fullPage: true,
});
await browser.close();

console.log(
	JSON.stringify(
		{
			kind: "baseline browser evidence",
			source: process.env.TRL1386_SOURCE!,
			url: "http://127.0.0.1:4173/setup",
			httpStatus: response?.status() ?? null,
			focused,
			errors,
			...result,
		},
		null,
		2,
	),
);
```

Run the pilot:

```sh
mkdir -p "$trl1386_worktree/reports/native-mobile-boxd-proof-path"

PLAYWRIGHT_BROWSERS_PATH="$trl1386_run/browsers" \
TRL1386_SOURCE="$trl1386_source" \
TRL1386_SCREENSHOT="$trl1386_worktree/reports/native-mobile-boxd-proof-path/pilot-setup-light-320.png" \
  "$trl1386_bun" "$trl1386_run/pilot.ts" \
  > "$trl1386_worktree/reports/native-mobile-boxd-proof-path/pilot-result.json"
```

### 9. Run the matrix

Run each complete journey in these browser conditions:

| Condition | Browser method |
| --- | --- |
| 320-pixel width | Use a 320 by 720 CSS viewport. |
| Desktop-width comparison | Use a 1024 by 768 CSS viewport. |
| Light theme | Use light color scheme and store `light`. |
| Dark theme | Use dark color scheme and store `dark`. |
| Reduced motion | Set `reducedMotion: "reduce"`. |
| Long content | Return a ticket with long text, long identifiers, links, tasks, attachments, and activity. |
| Dense data | Return enough projects, tickets, checks, sub-tickets, and activity rows to scroll. |
| Loading | Delay the selected synthetic response. |
| Empty | Return valid empty collections. |
| Error | Return the typed error for the selected request. |
| Disabled | Assert the disabled control before valid input. |
| Hover and active | Use a desktop context and Playwright mouse actions. |
| Keyboard | Tab through every action, activate it, and record the focus target. |
| Accessible names | Query every action by role and accessible name. |
| Contrast | Inject `axe-core` and fail serious or critical contrast results. |
| Stable layout | Record element boxes before and after data arrives. |
| Browser 200-percent reflow | Use a 160 CSS pixel viewport as the 320-pixel physical-width equivalent. |

The last row is browser reflow evidence. It is not native Dynamic Type evidence.

## Journey checks

### Setup and pairing

Prove these states in order:

1. Fresh setup with an empty name and the default URL prefix.
2. Invalid URL text and its error.
3. A disabled Save action.
4. A connection timeout.
5. An unreachable server.
6. A successful typed connection.
7. An invalid actor name.
8. A successful save.
9. A reload that retains the saved browser fixture values.
10. An invalid pair link.
11. A valid pair link.
12. A scan cancel action.

The browser can drive the scan controls. It cannot prove camera permission or QR capture.

### Projects and tickets

Prove these states in order:

1. Loading projects.
2. Empty projects.
3. An unreachable server with Retry and Change server.
4. A dense project list.
5. A project with no tickets.
6. A project with a dense ticket list.
7. A long ticket.
8. Status and priority sheet actions.
9. A successful ticket update.
10. A refused ticket update.
11. Attachment open and close.
12. Review actions when the ticket permits them.

### Search

Keep native search changes outside the web Page source.

Prove these states in order:

1. Empty search with no recent values.
2. Retained recent searches.
3. Text entry and the debounce interval.
4. Loading results.
5. No results.
6. A typed search error.
7. Dense results.
8. Ticket navigation from a result.
9. Back navigation that retains the query.

### Settings

Prove these states in order:

1. The current server and actor name.
2. System, light, and dark theme choices.
3. A theme choice after reload.
4. Reopen setup.
5. Back navigation to Settings with retained values.

## Browser and native evidence boundary

| Claim | Expo Web on Boxd | Android or iOS device |
| --- | --- | --- |
| Route component renders | Yes | Required |
| 320 CSS pixel layout | Yes | Supporting only |
| Browser reflow at a 200-percent equivalent | Yes | Supporting only |
| Native Dynamic Type at 200 percent | No | Required |
| Light and dark component colors | Yes | Required |
| DOM keyboard focus | Yes | Supporting only |
| Native external-keyboard focus | No | Required |
| Browser accessible names and roles | Yes | Supporting only |
| TalkBack or VoiceOver output | No | Required |
| Browser pointer taps | Yes | Supporting only |
| Native touch, gestures, and hit targets | No | Required |
| Browser text entry | Yes | Supporting only |
| Soft keyboard and native text entry | No | Required |
| Browser local-storage retention | Yes | Supporting only |
| SQLite retention after app restart | No | Required |
| Browser reduced-motion media query | Yes | Supporting only |
| Native reduced-motion setting | No | Required |
| Browser sheets and dialogs | Yes | Supporting only |
| Native sheets, safe areas, and system back | No | Required |
| Pair-link route logic | Yes | Supporting only |
| Expo Go deep link | No | Required |
| QR control state | Yes | Supporting only |
| Camera permission and QR capture | No | Required |

A native verdict requires the device column. The browser column does not replace it.

## Native lane requirement

The current machine reports:

```text
xcrun=absent
adb=absent
emulator=absent
/dev/kvm exists
boxd user kvm access=no
```

A repeatable Android lane needs all of these properties:

- A pinned Android SDK and emulator.
- An AVD image that the Boxd image caches.
- `adb` and an emulator on `PATH`.
- Read and write access to `/dev/kvm` for the `boxd` user.
- A pinned Expo Go APK that matches Expo 57.
- An Appium or Maestro runner.
- A synthetic Trellis server that binds only to the Boxd machine.
- Screen capture, accessibility tree capture, and restart control.
- A cleanup command that stops the emulator and removes ticket data.

Do not change KVM permissions on a shared Boxd machine. Provision a Boxd image with the correct group membership before the native run.

An iOS lane needs a macOS runner or a physical iOS device. Boxd Linux cannot supply this lane.

## Pilot result

The bounded pilot ran on unchanged `origin/main`. It exported the temporary browser fixture and opened `/setup` in Chromium.

The pilot checked these facts:

- HTTP status 200.
- A 320 by 720 viewport.
- A light color scheme.
- Reduced motion.
- Visible Server URL content.
- One Tab press moves focus to the Server URL input.
- The focused input has the accessible name `Server URL`.
- Save starts disabled.
- The page reports no console error or page error.
- The static response has COOP and COEP headers.

Artifacts:

- [Pilot result](native-mobile-boxd-proof-path/pilot-result.json)
- [Setup screenshot](native-mobile-boxd-proof-path/pilot-setup-light-320.png)

Artifact SHA-256 values:

```text
fa0e96a7d2c1e1716ae57437c630da6a6f8a2a1017ca3560f31e97c80797f87d  pilot-result.json
c2b0716d16d39c13a0e871cfccc1eb844187269805cb302836fe6e6b21801dc8  pilot-setup-light-320.png
```

This pilot is baseline browser evidence. It is not native proof. It does not prove a complete journey.

## Cleanup

Stop only the processes that this run created.

```sh
set -eu

if test -f "$trl1386_run/server.pid"; then
  kill "$(cat "$trl1386_run/server.pid")" 2>/dev/null || true
fi

pkill -f "$trl1386_run/browsers" 2>/dev/null || true

rm -rf "$trl1386_run"
rm -rf "$trl1386_worktree/node_modules"
rm -rf "$trl1386_worktree/apps/web/node_modules"
rm -rf "$trl1386_worktree/packages/ui/node_modules"
rm -rf "$trl1386_worktree/apps/mobile/.expo"

cd "$trl1386_worktree"
git status --short
```

The final status must contain only the report and its committed pilot artifacts. Verify that port 4173 has no listener before the ticket ends.

## Exclusions

This report does not add a web Page route. It does not add a shared Page contract. It does not change native search. It does not use live Trellis data. It does not run a Mac build. It does not claim an Android or iOS result.
