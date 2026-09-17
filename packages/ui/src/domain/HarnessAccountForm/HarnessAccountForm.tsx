import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Dialog } from "../../primitives/Dialog";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";

type Harness = "claude" | "codex" | "opencode" | "pi" | "muse";
export function HarnessAccountForm({
	open,
	busy,
	error,
	onClose,
	onSubmit,
}: {
	open: boolean;
	busy: boolean;
	error?: string;
	onClose: () => void;
	onSubmit: (value: { name: string; harness: Harness; profilePath?: string }) => void;
}) {
	const [name, setName] = useState("");
	const [harness, setHarness] = useState<Harness>("claude");
	const [path, setPath] = useState("");
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => !next && !busy && onClose()}
			title="Add agent account"
			description="Create a separate login profile, or connect an existing profile on this machine."
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit({ name: name.trim(), harness, ...(path.trim() ? { profilePath: path.trim() } : {}) });
				}}
			>
				<Input
					label="Account name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					required
					maxLength={120}
					placeholder="Work"
					autoFocus
				/>
				<div className="flex flex-col gap-2">
					<span className="text-sm">Harness</span>
					<Select
						label="Account harness"
						value={harness}
						onValueChange={setHarness}
						items={[
							{ value: "claude", label: "Claude" },
							{ value: "codex", label: "Codex" },
							{ value: "opencode", label: "OpenCode" },
							{ value: "pi", label: "Pi" },
							{ value: "muse", label: "Muse" },
						]}
					/>
				</div>
				<Input
					label="Existing profile directory (optional)"
					value={path}
					onChange={(event) => setPath(event.target.value)}
					placeholder="Leave blank for a new profile"
				/>
				<p className="text-xs text-fg-muted">
					Use an absolute path. Claude uses its config directory; Codex uses CODEX_HOME; Pi uses its agent directory;
					OpenCode uses XDG_DATA_HOME; Muse uses one directory as XDG_CONFIG_HOME and XDG_DATA_HOME.
				</p>
				{error && (
					<p role="alert" className="text-sm text-danger">
						{error}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button disabled={busy} onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={busy} disabled={!name.trim()}>
						Add account
					</Button>
				</div>
			</form>
		</Dialog>
	);
}
