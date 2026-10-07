import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const source = "9a50076c324b3d2575762e5bdcba6838061c8be5";
const tree = JSON.parse(
	execFileSync("gh", ["api", `repos/superset-sh/superset/git/trees/${source}?recursive=1`], {
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	}),
).tree;
const upstream = `${root}fixture/upstream/`;
const files = await readdir(upstream, { recursive: true });
const identities = [];
for (const file of files) {
	const match = tree.find((row) => row.path === file && row.type === "blob");
	if (!match) continue;
	const bytes = await readFile(upstream + file);
	const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
	if (blob !== match.sha) throw new Error(`Official source bytes differ: ${file}`);
	identities.push({
		path: file,
		gitBlob: blob,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		bytes: bytes.length,
	});
}
if (identities.length !== 12) throw new Error(`Expected 12 original source files, got ${identities.length}`);
await writeFile(
	`${root}source-manifest.json`,
	`${JSON.stringify(
		{ repository: "superset-sh/superset", source, date: new Date().toISOString(), files: identities },
		null,
		2,
	)}\n`,
);
const results = JSON.parse(await readFile(`${root}fixture-results.json`, "utf8"));
if (results.results.length !== 8 || results.results.some((r) => r.errors.length || r.overflow))
	throw new Error("Fixture capture failed");
const checks = results.results.filter((r) => r.width === 320);
if (
	checks.some(
		(r) =>
			r.checkingDisabled !== "true" || !r.refetchReturns || r.guideTarget !== "https://docs.superset.sh/remote-access",
	)
)
	throw new Error("Fixture action check failed");
await mkdir(`${root}page`, { recursive: true });
await cp(`${root}assets`, `${root}page/assets`, { recursive: true });
await cp(
	`${upstream}apps/docs/public/images/remote-workspaces-security-toggle.png`,
	`${root}page/assets/official-relay-toggle.png`,
);
for (const file of ["source-manifest.json", "fixture-results.json", "public-results.json"])
	await cp(root + file, `${root}page/${file}`);
await cp(`${upstream}LICENSE.md`, `${root}page/Superset-LICENSE.md`);
const figure = (name, caption) =>
	'<figure><a href="assets/' +
	name +
	'"><img loading="lazy" src="assets/' +
	name +
	'" alt="' +
	caption +
	'"></a><figcaption>' +
	caption +
	"</figcaption></figure>";
const html =
	'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Superset setup: rendered evidence</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:auto;padding:32px;color:#18181b;background:#fafafa}h1{font-size:32px;line-height:1.15}h2{margin-top:48px}a{color:#174bb0}figure{margin:0 0 24px}img{max-width:100%;height:auto;border:1px solid #ddd}figcaption{font-size:14px;margin-top:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px}.notice{padding:20px;border:2px solid #18181b;background:white}li{margin-bottom:8px}code{overflow-wrap:anywhere}</style><main><p>TRL-1572 · Captured 7 October 2026 · Boxd Chromium</p><h1>Superset setup: rendered evidence</h1><div class="notice"><strong>This is not a Superset native app test.</strong><p>The public web app, official desktop screenshot, and native component fixture are separate evidence sources. No account, private token, or live host was used.</p></div><h2>Public product boundary</h2><p><a href="https://app.superset.sh/">The public app</a> redirects to sign-in. The two captures show the actual unauthenticated page. The authenticated setup journey remains unavailable.</p><div class="grid">' +
	figure("app-320.png", "Live web app: sign-in at 320 pixels") +
	figure("app-desktop.png", "Live web app: sign-in at 1280 pixels") +
	'</div><h2>Official desktop relay screen</h2><p><a href="https://docs.superset.sh/remote-access">The official Remote Access guide</a> supplies this image. It is a vendor screenshot, not an independently executed desktop session. The guide states that relay activation restarts the host and interrupts terminals.</p>' +
	figure("official-relay-toggle.png", "Official Superset screenshot: desktop relay access") +
	'<h2>Exact native component, browser fixture</h2><p>The fixture imports HomeConnectHostScreen, SetupStep, Button, Text, Icon, utility classes, theme CSS, and the English catalog from <a href="https://github.com/superset-sh/superset/tree/' +
	source +
	'">official source ' +
	source.slice(0, 8) +
	'</a>. Each original file matches its Git blob. The component markup, text, styles, and imported icon remain unchanged.</p><p>The fixture supplies the organization name and an empty-host query. Its controlled promise exposes Check again and Checking states. Haptics and analytics record no external action. The router and guide action record their destination. The native Stack toolbar returns no header in this browser fixture.</p><p>That exclusion means the screenshot shows the component body, not the full native screen. Native safe areas, iOS fonts, system bars, VoiceOver, real discovery, persistence, and successful host connection remain unverified. The 160-pixel case is narrow reflow evidence, not a claim of native Dynamic Type or browser 200% zoom.</p><div class="grid">' +
	["light", "dark"]
		.map(
			(t) =>
				figure(`no-host-${t}-320.png`, `Official component fixture: ${t}, 320 pixels`) +
				figure(`no-host-${t}-320-checking.png`, `Official component fixture: ${t}, Check again in progress`) +
				figure(`no-host-${t}-320-focus.png`, `Official component fixture: ${t}, keyboard focus`) +
				figure(`no-host-${t}-390.png`, `Official component fixture: ${t}, 390 pixels`),
		)
		.join("") +
	'</div><h2>Narrow text and wide layout</h2><p>The long organization name is synthetic. Click an image to inspect it at its original size.</p><div class="grid">' +
	["light", "dark"]
		.map(
			(t) =>
				figure(`no-host-${t}-160.png`, `Official component fixture: ${t}, 160 pixels, top`) +
				figure(`no-host-${t}-160-bottom.png`, `Official component fixture: ${t}, 160 pixels, scrolled to the actions`) +
				figure(`no-host-${t}-1280.png`, `Official component fixture: ${t}, 1280 pixels`),
		)
		.join("") +
	'</div><h2>Recorded result and limits</h2><p>All eight width/theme cases render without a page error or document overflow. Both 320-pixel actions measure 44 pixels high. Check again disables during the controlled promise and returns after completion. Read the setup guide records the official Remote Access URL.</p><p>The fixture does not prove error recovery, host discovery, success navigation, account authentication, or retained data. The public product does not provide those journeys without an account. This evidence supplies no superiority verdict.</p><p><a href="fixture-results.json">Fixture results</a> · <a href="public-results.json">Public page records</a> · <a href="source-manifest.json">Exact source identities</a> · <a href="Superset-LICENSE.md">Superset license</a></p><h2>Supporting public captures</h2><p>The mobile marketing page shows workspace, terminal, and diff previews. Those views do not establish the setup journey.</p>' +
	figure("mobile-desktop.png", "Official mobile marketing page, retained as context only") +
	figure("remote-access-desktop.png", "Official Remote Access documentation, captured from the public page") +
	"</main></html>";
await writeFile(`${root}page/index.html`, `${html}\n`);
console.log(
	JSON.stringify({
		originalFiles: identities.length,
		cases: results.results.length,
		htmlSha256: createHash("sha256").update(`${html}\n`).digest("hex"),
	}),
);
