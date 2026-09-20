import type { TicketContract } from "@trellis/api";
import { ContractBlock as ContractBlockView } from "@trellis/ui/review";
import { copyText } from "../../../lib/clipboard";
import { evidenceOwedText } from "./evidenceOwedText/evidenceOwedText";

export type ContractBlockProps = {
	// The repository name that picks the path rules, such as `trellis`.
	repo: string;
	contract: TicketContract;
};

// The contract of a ticket. The five clauses come from the ticket record.
// `Evidence owed` is the one derived line: it reads the kind of the change out
// of the file list.
export function ContractBlock({ repo, contract }: ContractBlockProps) {
	return (
		<ContractBlockView
			result={contract.result}
			files={contract.files}
			leaveAlone={contract.leaveAlone}
			verify={contract.verify}
			reviewFocus={contract.reviewFocus}
			evidenceOwed={evidenceOwedText(repo, contract.files)}
			onCopy={(text) => void copyText(text, "Copied to the clipboard")}
		/>
	);
}
