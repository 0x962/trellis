import { toast } from "@trellis/ui";

// Writes `text` to the clipboard and confirms with a toast that shows the
// text. A copy has no visible result on the page, so the toast is the only
// feedback, and the reader sees what went to the clipboard.
export const copyText = async (text: string, message: string) => {
	await navigator.clipboard.writeText(text);
	toast.command({ title: message, command: text });
};
