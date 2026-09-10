// The server refused an upload. `maxBytes` is the cap it reported.
export type UploadError = { code: "PAYLOAD_TOO_LARGE"; maxBytes: number };

// One file on its way to the server. `sent` counts the bytes the browser
// has written and `percent` is what the bar shows.
export type Upload = {
	id: string;
	name: string;
	size: number;
	sent: number;
	percent: number;
	error: UploadError | null;
};

export type Uploads = {
	uploads: Upload[];
	// Starts one upload per file and keeps one progress entry for each.
	start: (files: File[]) => void;
	// Takes one failed entry off the list.
	dismiss: (id: string) => void;
};

// Every upload of one ticket. An upload that settles invalidates the
// attachments list of that ticket, so the grid renders the server's rows
// and never a second copy of its own.
export const useUploads = (_ticket: string): Uploads => {
	throw new Error("useUploads is not implemented.");
};
