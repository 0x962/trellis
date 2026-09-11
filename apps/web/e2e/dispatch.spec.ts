import { expect, test } from "@playwright/test";
import { get, statusOf } from "./api";
import { createTicket, ensureProject, moveTicket, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { callsOf, flagOf, sentTo, tabOf } from "./supersetStub";
import { signIn } from "./support";

// M8. The server runs one manager agent per project in Superset. The
// superset stub (stubs/superset.ts) records every call and runs a simulated
// agent (stubs/agent.ts) wherever the server launches Claude. Each simulated
// agent drives the real CLI as its own actor.

// The dispatcher sends a batch 10 s after the last event. A wake assertion
// waits 3 s more for the stub spawns and the poll interval.
const BATCH_MS = 10_000;
const WAKE_MS = BATCH_MS + 3_000;
// A simulated agent acts at once, but each of its trellis calls spawns the CLI.
const AGENT_MS = 10_000;

const human = "human:dana";

type Listed = { items: { identifier: string; title: string; status: { slug: string } }[] };

// command.spec.ts seeds CDE with Todo tickets. The manager starts a builder
// for every Todo ticket, so the seeds are canceled before the manager starts,
// and the only Todo ticket is the one this spec creates.
test.beforeAll(async () => {
	ensureProject("CDE", "Code");
	trellis(["projects", "repos", "CDE", "--add", "acme/cde"], human);
	const seeded = await get<Listed>("/tickets?project=CDE");
	for (const item of seeded.items) {
		if (item.status.slug === "todo") moveTicket(item.identifier, "canceled", human);
	}
	ensureProject("BAT", "Batching");
	trellis(["projects", "repos", "BAT", "--add", "acme/bat"], human);
});

test("dispatch > a web ticket goes to a builder, a clean review, and Human Review, and a send-back reaches the builder", async ({
	page,
}) => {
	test.setTimeout(180_000);

	// Agents on, in the web settings. The Agent manager block is its own
	// settings page, which the hash selects.
	await signIn(page, "/settings#manager");
	const agents = page.getByRole("switch", { name: "Turn on agents" });
	if (!(await agents.isChecked())) await agents.click();
	await expect(agents).toBeChecked();
	const manager = page.getByRole("group", { name: "CDE Code" }).getByRole("switch", { name: "Manager" });
	await manager.click();
	await expect(manager).toBeChecked();

	// The server starts the manager when its project turns on.
	await expect.poll(() => tabOf("CDE manager"), { timeout: AGENT_MS }).toBeDefined();
	const managerTab = tabOf("CDE manager")!;
	const managerWorkspace = callsOf("ws create").find((call) =>
		flagOf(call, "--command")?.includes("claude -n 'CDE manager'"),
	)!;
	expect(flagOf(managerWorkspace, "--tag")).toBe("trellis-cde");
	expect(flagOf(managerWorkspace, "--project")).toBe("sp-cde");

	// A person creates a ticket in the web.
	await page.goto("/p/CDE");
	await expect(page.getByRole("heading", { name: "Code", level: 1 })).toBeVisible();
	const title = `Add a dry-run flag ${Date.now()}`;
	await page.keyboard.press("c");
	const composer = page.getByRole("dialog", { name: "New ticket" });
	await composer.getByRole("textbox", { name: "Title" }).fill(title);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(composer).toBeHidden();
	const created = (await get<Listed>("/tickets?project=CDE")).items.find((item) => item.title === title)!;
	const identifier = created.identifier;

	// One batch wakes the manager once, with a pointer to the inbox.
	await expect.poll(() => sentTo(managerTab.terminalId).length, { timeout: WAKE_MS }).toBe(1);
	const [wake] = sentTo(managerTab.terminalId);
	expect(wake).toMatch(/^trellis: /);
	expect(wake).toContain(identifier);
	expect(wake).toContain("trellis agents inbox --project CDE");

	// The manager reads the inbox and starts a builder: a workspace named
	// after the ticket, in the project folder, with Claude named after the
	// ticket.
	const builderWorkspace = () => callsOf("ws create").find((call) => flagOf(call, "--name") === identifier);
	await expect.poll(builderWorkspace, { timeout: AGENT_MS }).toBeDefined();
	const create = builderWorkspace()!;
	expect(flagOf(create, "--tag")).toBe("trellis-cde");
	expect(flagOf(create, "--project")).toBe("sp-cde");
	expect(flagOf(create, "--branch")!.startsWith(`${identifier.toLowerCase()}-`)).toBe(true);
	expect(flagOf(create, "--command")).toContain(`claude -n '${identifier}'`);
	expect(flagOf(create, "--command")).toContain(`TRELLIS_ACTOR='agent:builder-${identifier.toLowerCase()}'`);
	expect(sentTo(managerTab.terminalId)).toHaveLength(1);
	const builderTab = tabOf(identifier)!;

	// The ticket page lists the builder.
	await page.goto(`/t/${identifier}`);
	await expect(page.getByRole("list", { name: "Agent sessions" })).toContainText("Builder");

	// The builder links its pull request and moves the ticket to Agent Review.
	await expect.poll(() => statusOf(identifier), { timeout: AGENT_MS }).toBe("Agent Review");

	// The next batch wakes the manager, which starts a reviewer in the
	// builder's workspace on the pull request.
	const reviewerTerminal = () =>
		callsOf("terminals create").find((call) => flagOf(call, "--command")?.includes(`claude -n '${identifier} review'`));
	await expect.poll(reviewerTerminal, { timeout: WAKE_MS + AGENT_MS }).toBeDefined();
	expect(flagOf(reviewerTerminal()!, "--workspace")).toBe(builderTab.workspaceId);
	expect(flagOf(reviewerTerminal()!, "--command")).toContain(`--pr '${failingPrUrl}'`);

	// The reviewer comments that the ticket is clean. The next batch wakes the
	// manager, which moves the ticket to Human Review.
	await expect.poll(() => statusOf(identifier), { timeout: WAKE_MS + AGENT_MS }).toBe("Human Review");

	// The person sends the ticket back with a comment. Needs you carries no
	// Send back control any more, so the comment comes from the CLI.
	const wakesBefore = sentTo(managerTab.terminalId).length;
	const sendBack = "Rename the flag to --dry-run and keep the old name as an alias";
	trellis(["comment", identifier, "--body", sendBack], human);
	moveTicket(identifier, "in-progress", human);

	// The send-back wakes the manager, which forwards the comment to the
	// builder's terminal.
	await expect
		.poll(() => sentTo(builderTab.terminalId), { timeout: WAKE_MS + AGENT_MS })
		.toContain(`trellis: ${identifier}: ${sendBack}`);
	const wakesAfter = sentTo(managerTab.terminalId).slice(wakesBefore);
	expect(wakesAfter.length).toBeGreaterThanOrEqual(1);
	expect(wakesAfter[0]).toContain(identifier);
});

test("dispatch > 12 quick edits wake the manager twice: 10 at once, then 2 after 10 s", async () => {
	test.setTimeout(90_000);

	// Human Review asks nothing of the manager unless a person comments, so
	// the simulated manager reads each batch and adds no event of its own.
	const ticket = createTicket("BAT", `Batch target ${Date.now()}`);
	moveTicket(ticket.identifier, "human-review", human);
	trellis(["agents", "on", "--project", "BAT"], human);
	await expect.poll(() => tabOf("BAT manager"), { timeout: AGENT_MS }).toBeDefined();
	const managerTab = tabOf("BAT manager")!;
	const before = sentTo(managerTab.terminalId).length;
	const wakes = () => sentTo(managerTab.terminalId).slice(before);

	// Each edit spawns the CLI, so ten edits take a few seconds, well inside
	// the 10 s timer that each edit restarts.
	const edit = (n: number) => trellis(["edit", ticket.identifier, "--title", `Batch edit ${n}`], human);
	for (let n = 1; n <= 10; n += 1) edit(n);

	// The 10th waiting event sends the batch at once.
	await expect.poll(() => wakes().length, { timeout: 3_000 }).toBe(1);
	expect(wakes()[0]).toContain("10 changes");

	edit(11);
	edit(12);
	const lastEditAt = Date.now();
	expect(wakes()).toHaveLength(1);

	// The last two go out 10 s after the last edit.
	await expect.poll(() => wakes().length, { timeout: WAKE_MS }).toBe(2);
	expect(Date.now() - lastEditAt).toBeGreaterThanOrEqual(BATCH_MS - 500);
	expect(wakes()[1]).toContain("2 changes");

	// Nothing waits, so no third batch comes after one more full timer.
	await new Promise((done) => setTimeout(done, BATCH_MS + 1_000));
	expect(wakes()).toHaveLength(2);
});
