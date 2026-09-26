import { Copy, PencilSimple, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { Textarea } from "../../primitives/Textarea";
import { Tooltip } from "../../primitives/Tooltip";
import { writeClipboard } from "../../utils/writeClipboard";
import { ReviewReactions } from "../ReviewReactions/ReviewReactions";
import type { Edit, Message } from "./thread";

// The word a reader sees for each state of a send to an agent.
const deliveryWords: Record<string, string> = {
	pending: "sending",
	sending: "sending",
	held: "waits for an agent",
	sent: "sent",
	failed: "failed",
	unknown: "not confirmed",
};

type Props = {
	message: Message;
	// True for the first message of the thread, the one that carries the
	// anchor and any suggestion the thread applies.
	root: boolean;
	anchorAction?: ReactNode;
	renderBody: (body: string, message: { id: string; root: boolean }) => ReactNode;
	// True while a reply, an edit, a delete or a reaction of this card waits
	// for the server.
	busy: boolean;
	// Whether the reader may edit and delete this message.
	canChange: boolean;
	actor?: string;
	// Set when the reader has this message open in the edit form.
	edit: Edit | null;
	setEdit: (edit: Edit | null) => void;
	// Sends one call and writes its failure into the card.
	run: (action: () => Promise<unknown>) => Promise<void>;
	onEdit: (id: string, body: string, version: number) => Promise<unknown>;
	// A card without it draws no delete button.
	onDelete?: (id: string) => Promise<unknown>;
	deleteRootLabel?: string;
	// A card without it draws no reaction row.
	onReaction?: (id: string, reaction: string, remove: boolean) => Promise<unknown>;
};

export function ThreadMessage({
	message,
	root,
	anchorAction,
	renderBody,
	busy,
	canChange,
	actor,
	edit,
	setEdit,
	run,
	onEdit,
	onDelete,
	deleteRootLabel,
	onReaction,
}: Props) {
	return (
		<section className="review-message">
			<header>
				<strong>{message.author}</strong>
				<span className="review-meta">
					{message.kind} · {new Date(message.createdAt).toLocaleDateString()}
				</span>
				{message.delivery && (
					<span
						className="review-delivery"
						data-state={message.delivery.state}
						title={message.delivery.error ?? undefined}
					>
						{deliveryWords[message.delivery.state]}
					</span>
				)}
				{message.session && (
					<Tooltip content={`Copy session ${message.session}`}>
						<IconButton
							className="review-message-action"
							label="Copy session"
							icon={<Copy />}
							onClick={() => void writeClipboard(message.session!)}
						/>
					</Tooltip>
				)}
				{canChange && (
					<Tooltip content="Edit message">
						<IconButton
							className="review-message-action"
							label="Edit message"
							icon={<PencilSimple />}
							disabled={busy}
							onClick={() => setEdit({ id: message.id, body: message.body, version: message.version })}
						/>
					</Tooltip>
				)}
				{onDelete !== undefined && canChange && (
					<Tooltip content={root ? (deleteRootLabel ?? "Delete thread") : "Delete message"}>
						<IconButton
							className="review-message-action"
							label={root ? (deleteRootLabel ?? "Delete thread") : "Delete message"}
							icon={<Trash />}
							disabled={busy}
							onClick={() => void run(() => onDelete(message.id))}
						/>
					</Tooltip>
				)}
			</header>
			{root && anchorAction !== undefined && <div className="review-thread-location">{anchorAction}</div>}
			{edit?.id === message.id ? (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void run(async () => {
							await onEdit(edit.id, edit.body, edit.version);
							setEdit(null);
						});
					}}
				>
					<Textarea
						label="Edit message"
						value={edit.body}
						onChange={(e) => setEdit({ ...edit, body: e.target.value })}
					/>
					<div className="review-form-actions">
						<Button type="button" onClick={() => setEdit(null)}>
							Cancel
						</Button>
						<Button type="submit" disabled={busy || !edit.body.trim()}>
							Save
						</Button>
					</div>
				</form>
			) : (
				renderBody(message.body, { id: message.id, root })
			)}
			{onReaction !== undefined && (
				<ReviewReactions
					reactions={message.reactions}
					actor={actor}
					busy={busy}
					onReaction={(reaction, remove) => void run(() => onReaction(message.id, reaction, remove))}
				/>
			)}
		</section>
	);
}
