import { instructions, type Ticket } from "@trellis/api";
import { Button, Checkbox, cx, IconButton, Popover, Tooltip, toast, useHotkey } from "@trellis/ui";
import { ChevronDown, Play } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { copyText } from "../../../lib/clipboard";
import { lowestPositionStatus } from "../../../lib/statusPicks";
import { useEnsureStatuses, useStatuses } from "../../ticket/hooks/useStatuses";
import { useTicketWrite } from "../../ticket/hooks/useTicketWrite";
import { failToast } from "../../ticket/utils/failToast";
import { useCopyBrief } from "../BriefCopy";
import { buildAgentCommand } from "./utils/buildAgentCommand";

export type StartWithAgentProps = {
	ticket: Ticket;
};

// Whether a start also moves the ticket to the first started status.
export const markStartedKey = "trellis.start-with-agent.mark-started";

const optionClass = "w-full justify-start";

// The primary action of a ticket: it copies the shell command that starts
// an agent on it and shows the command in the toast. With the box checked,
// the ticket also moves to the lowest started status. The dropdown holds
// the other copies: the command alone, the brief markdown, and the CLI
// cheat-sheet. The two halves touch and share the primary fill, so they
// read as one control.
export function StartWithAgent({ ticket }: StartWithAgentProps) {
	const { orpc, queryClient } = useApp();
	const { write } = useTicketWrite(ticket.identifier);
	const ensureStatuses = useEnsureStatuses(ticket.project.path);
	const startedName = lowestPositionStatus(useStatuses(ticket.project.path), "started")?.name ?? "Started";
	const copyBrief = useCopyBrief(ticket);
	const [open, setOpen] = useState(false);
	const [markStarted, setMarkStarted] = useState(() => localStorage.getItem(markStartedKey) === "1");

	const moveToStarted = async () => {
		const started = lowestPositionStatus(await ensureStatuses(), "started")!;
		if (ticket.status.id === started.id) return;
		try {
			await write((client) => client.tickets.move({ ticket: ticket.identifier, status: started.slug }), {
				optimistic: (row) => ({ ...row, status: { ...started } }),
			});
		} catch (error) {
			failToast(`${ticket.identifier} did not move to ${started.name}.`, error, () => void moveToStarted());
		}
	};

	// The template may not be here yet when the chord fires on a fresh page.
	const agentCommand = async () => {
		const { startWithAgentTemplate } = await queryClient.ensureQueryData(orpc.settings.get.queryOptions({}));
		return buildAgentCommand(startWithAgentTemplate, ticket.identifier);
	};

	const start = async () => {
		const command = await agentCommand();
		await navigator.clipboard.writeText(command);
		toast.command({ title: "Copied the command. Paste it in a terminal.", command }, { id: "start-with-agent" });
		if (markStarted) await moveToStarted();
	};

	// The command alone never moves the ticket, even when the box is checked.
	const copyCommandOnly = async () => copyText(await agentCommand(), `Copied the command for ${ticket.identifier}`);

	useHotkey("mod+shift+a", (event) => {
		event.preventDefault();
		void start();
	});

	const toggleMarkStarted = (checked: boolean) => {
		setMarkStarted(checked);
		localStorage.setItem(markStartedKey, checked ? "1" : "0");
	};

	return (
		<span className="inline-flex items-center">
			<Tooltip content="Start with agent ⌘⇧A">
				<Button
					variant="primary"
					size="sm"
					aria-label="Start with agent"
					icon={<Play />}
					className="rounded-r-none"
					onClick={() => void start()}
				>
					Start with agent
				</Button>
			</Tooltip>
			<Popover
				open={open}
				onOpenChange={setOpen}
				align="end"
				className="w-64 p-1"
				trigger={
					<IconButton
						label="Start with agent options"
						icon={<ChevronDown />}
						variant="primary"
						size="md"
						className={cx("w-6 rounded-l-none border-l border-l-on-accent/25", open && "brightness-95")}
					/>
				}
			>
				<div className="flex flex-col">
					<Button variant="quiet" className={optionClass} onClick={() => void start()}>
						Copy command
					</Button>
					<Button variant="quiet" className={optionClass} onClick={() => void copyCommandOnly()}>
						Copy command only
					</Button>
					<Button variant="quiet" className={optionClass} onClick={() => void copyBrief()}>
						Copy brief as markdown
					</Button>
					<Button
						variant="quiet"
						className={optionClass}
						onClick={() => void copyText(instructions(ticket.project.key), "Copied the CLI cheat-sheet")}
					>
						Copy CLI cheat-sheet
					</Button>
					<div className="mt-1 border-t border-border px-2 pt-2 pb-1">
						<Checkbox label={`Also move to ${startedName}`} checked={markStarted} onCheckedChange={toggleMarkStarted} />
					</div>
				</div>
			</Popover>
		</span>
	);
}
