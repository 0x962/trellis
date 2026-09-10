import { toast } from "@trellis/ui";

// Writes `text` to the clipboard and confirms with a toast. A copy has no
// visible result on the page, so the toast is the only feedback.
export const copyText = async (text: string, message: string) => {
	await navigator.clipboard.writeText(text);
	toast.success(message);
};
