import { Chats, Check, Copy, ListBullets, PencilSimple, X } from "@phosphor-icons/react";
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
import { cx } from "../../../utils/cx";
import { hitArea } from "../../../utils/hitArea";
import { Section } from "../Section";

const commands = [
	{ id: "CDE-42", label: "Restore the export pages after the upstream 1.27 merge", hint: "CDE-42" },
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
						{ label: "Edit", icon: <PencilSimple />, kbd: "e", onSelect: () => toast("Edit") },
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
			<Section
				name="Menu with a state"
				note="one row of the set is checked; the check closes the menu as an action row does"
			>
				<Menu
					label="Section"
					trigger={<Button>Sessions</Button>}
					items={[
						{ label: "Epics", icon: <ListBullets />, checked: false, onSelect: () => toast("Epics") },
						{ label: "Sessions", icon: <Chats />, checked: true, onSelect: () => toast("Sessions") },
						{ label: "Rename…", icon: <PencilSimple />, onSelect: () => toast("Rename") },
					]}
				/>
			</Section>
			<Section name="Dialog" note="modal; focus stays inside">
				<Button onClick={() => setDialogOpen(true)}>Delete ticket</Button>
				<Dialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Delete ticket"
					description="trellis cannot restore a deleted ticket."
				>
					<div className="flex justify-end gap-2 max-md:*:flex-1">
						<Button size="md" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button size="md" variant="danger" onClick={() => setDialogOpen(false)}>
							Delete
						</Button>
					</div>
				</Dialog>
			</Section>
			<Section name="Sheet" note="non-modal 720 px peek with a resize handle; slides in from the right in 240 ms">
				<Button onClick={() => setSheetOpen(true)}>Peek CDE-43</Button>
				<Sheet
					open={sheetOpen}
					onOpenChange={setSheetOpen}
					modal={false}
					title="CDE-43"
					resizeHandle={
						<button
							type="button"
							aria-label="Resize"
							className={cx(
								"h-full w-1 cursor-col-resize transition-colors duration-hover hover:bg-accent focus-visible:bg-accent",
								"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
								hitArea.handle4,
							)}
						/>
					}
				>
					<div className="flex flex-col gap-2 p-4">
						<h3 className="text-xl font-semibold">Merge upstream 1.27 and keep every marked site</h3>
						<p className="text-md text-fg-muted">The peek shows the ticket page over the list.</p>
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
			<Section name="Toast" note="plain, success, error, and a copied command">
				<Button onClick={() => toast("Saved")}>Plain</Button>
				<Button onClick={() => toast.success("Approved CDE-42")}>Success</Button>
				<Button onClick={() => toast.error("gh is not signed in. Run gh auth login.")}>Error</Button>
				<Button
					variant="primary"
					onClick={() =>
						toast.command({
							title: "Copied the command. Paste it in a terminal.",
							command: "trellis brief CDE-42",
						})
					}
				>
					Command
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
