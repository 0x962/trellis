import { Check, Copy, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../primitives/Button";
import { Command } from "../../../primitives/Command";
import { Dialog } from "../../../primitives/Dialog";
import { IconButton } from "../../../primitives/IconButton";
import { Menu } from "../../../primitives/Menu";
import { Popover } from "../../../primitives/Popover";
import { Sheet } from "../../../primitives/Sheet";
import { Toaster, toast } from "../../../primitives/Toast";
import { Tooltip } from "../../../primitives/Tooltip";
import { Section } from "../Section";

const commands = [
	{ id: "CDE-42", label: "Restore the fork pages after the upstream 1.27 merge", hint: "CDE-42" },
	{ id: "CDE-44", label: "Terminal pane loses scrollback on session handoff", hint: "CDE-44" },
	{ id: "TRL-4", label: "Poller batches PRs in one GraphQL call", hint: "TRL-4" },
];

// Every overlay primitive, each behind a trigger.
export function OverlaySections() {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [commandOpen, setCommandOpen] = useState(false);
	return (
		<>
			<Section name="Popover" note="click the trigger; Escape or an outside click closes it">
				<Popover trigger={<Button>Display</Button>}>
					<p className="px-1 py-0.5 text-sm text-fg-muted">Group by status, order by updated.</p>
				</Popover>
			</Section>
			<Section name="Menu" note="arrow keys move, Enter runs, Escape closes">
				<Menu
					label="Actions"
					items={[
						{ label: "Edit", icon: <Pencil />, kbd: "e", onSelect: () => toast("Edit") },
						{ label: "Copy link", icon: <Copy />, onSelect: () => toast("Copied") },
						{ label: "Delete", icon: <X />, danger: true, onSelect: () => toast("Deleted") },
						{ label: "Archive", disabled: true, onSelect: () => {} },
					]}
				/>
				<Menu
					label="Actions"
					trigger={<Button>Actions</Button>}
					items={[{ label: "Edit", onSelect: () => toast("Edit") }]}
				/>
			</Section>
			<Section name="Dialog" note="modal; focus stays inside">
				<Button onClick={() => setDialogOpen(true)}>Delete ticket</Button>
				<Dialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Delete ticket"
					description="This cannot be undone."
				>
					<div className="flex justify-end gap-2">
						<Button onClick={() => setDialogOpen(false)}>Cancel</Button>
						<Button variant="danger" onClick={() => setDialogOpen(false)}>
							Delete
						</Button>
					</div>
				</Dialog>
			</Section>
			<Section name="Sheet" note="slides in from the right in 240 ms">
				<Button onClick={() => setSheetOpen(true)}>Peek CDE-43</Button>
				<Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="CDE-43">
					<div className="flex flex-col gap-2 p-4">
						<h3 className="text-xl font-semibold">Merge upstream 1.27 and keep every marked site</h3>
						<p className="text-md text-fg-muted">The peek shows the ticket page without leaving the list.</p>
					</div>
				</Sheet>
			</Section>
			<Section name="Tooltip" note="hover or focus the trigger">
				<Tooltip content="Approve">
					<IconButton label="Approve" icon={<Check />} />
				</Tooltip>
				<Tooltip content="Copy link" side="bottom">
					<IconButton label="Copy link" icon={<Copy />} />
				</Tooltip>
			</Section>
			<Section name="Toast" note="plain, success, error, and the Start-with-agent command">
				<Button onClick={() => toast("Saved")}>Plain</Button>
				<Button onClick={() => toast.success("Approved CDE-42")}>Success</Button>
				<Button onClick={() => toast.error("gh is signed out")}>Error</Button>
				<Button
					variant="primary"
					onClick={() =>
						toast.command({ title: "Copied. Paste in your terminal.", command: 'claude "$(trellis brief CDE-42)"' })
					}
				>
					Start with agent
				</Button>
				<Toaster />
			</Section>
			<Section name="Command" note="inline, and in the Cmd-K dialog" className="items-start">
				<div className="w-140 overflow-hidden rounded-lg border border-border bg-elevated shadow-md">
					<Command items={commands} onSelect={(id) => toast(`Open ${id}`)} />
				</div>
				<Button onClick={() => setCommandOpen(true)} kbd="⌘K">
					Open
				</Button>
				<Command.Dialog open={commandOpen} onOpenChange={setCommandOpen}>
					<Command
						items={commands}
						onSelect={(id) => {
							setCommandOpen(false);
							toast(`Open ${id}`);
						}}
					/>
				</Command.Dialog>
			</Section>
		</>
	);
}
