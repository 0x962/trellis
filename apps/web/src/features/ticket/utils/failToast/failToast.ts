import { toast } from "@trellis/ui";
import { errorMessage } from "../../../../lib/conflict";

// The toast a failed write shows: what failed on the first line, the
// server's message on the second, and a Retry. An error toast stays 6 s.
export const failToast = (title: string, error: unknown, retry: () => void) =>
	toast.error(title, {
		description: errorMessage(error),
		duration: 6000,
		action: { label: "Retry", onClick: retry },
	});
