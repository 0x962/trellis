# Superset setup rendered evidence

This report captures the Superset coding-agent workspace on 7 October 2026.
The `page/` directory is the publishable Trellis Page.
No Trellis production source changes.

## Evidence classes

- Live public web: `app.superset.sh` redirects to sign-in without an account.
- Vendor image: the official remote-access guide supplies the desktop relay screenshot.
- Official source fixture: the no-host component body runs on React Native Web.
- Context only: the mobile marketing page shows workspace, terminal, and diff previews.

The fixture is not the Superset native app.
It does not prove that the App Store release contains the same source.
It omits the native Stack toolbar, safe areas, system bars, and native font metrics.
The 160-pixel case checks narrow reflow, not actual 200 percent zoom or Dynamic Type.

## Source identity

All 12 files in `source-manifest.json` match the official Git blobs at
`9a50076c324b3d2575762e5bdcba6838061c8be5`.
The source repository is https://github.com/superset-sh/superset.
The fixture preserves the component markup, source styles, icon, and English messages.
The `upstream/` files retain the Elastic License 2.0 and Superset copyright notice.
The full English catalog is a reproducible download, not a tracked source file.
The download uses the exact commit and checks its pinned SHA256 before use.
Its bytes remain identical to the captured catalog.

The local fixture adds an Expo entry point and a reduced Metro configuration.
It replaces query, router, analytics, haptics, and native-header boundaries.
These changes exist outside the retained upstream files.
The synthetic organization is Acme.
The host query returns a controlled promise.
The setup guide and router actions record destinations without an external action.
The fixture neither authenticates nor contacts a real host.

## Reproduce on Boxd

Use Bun 1.4.2 and the pinned fixture lockfile.

```sh
cd reports/superset-setup-rendered/fixture
bun install --frozen-lockfile
node prepare-catalog.mjs
bun x lingui compile
bun x expo export --platform web --output-dir /tmp/trellis-trl1572-web
PLAYWRIGHT_BROWSERS_PATH=/home/boxd/.cache/trl1420-playwright bun x playwright install chromium
python3 -m http.server 4197 --bind 127.0.0.1 --directory /tmp/trellis-trl1572-web
```

Run the captures in a second Boxd terminal.

```sh
cd reports/superset-setup-rendered
PLAYWRIGHT_BROWSERS_PATH=/home/boxd/.cache/trl1420-playwright node capture-public.mjs
PLAYWRIGHT_BROWSERS_PATH=/home/boxd/.cache/trl1420-playwright node capture-fixture.mjs
node build-report.mjs
```

Stop the private preview server after the capture.
The builder reads public GitHub metadata to check source bytes.
It needs an available `gh` command.

## Result

The fixture export includes 2,267 modules.
Eight width/theme cases render without a page error or document overflow.
The 320-pixel buttons measure 44 pixels high.
The controlled query exposes the disabled check state and returns to no-host.
The guide action records `https://docs.superset.sh/remote-access`.
The gallery retains the keyboard focus and narrow scroll captures.

A settled no-host response does not prove real discovery, success navigation, or network recovery.
The public sign-in page does not prove authenticated behavior.
Native accessibility, native retention, real relay access, and account setup remain unverified.
This report contains no superiority verdict.
