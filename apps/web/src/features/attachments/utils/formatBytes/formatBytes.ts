// The size of a file as a row shows it: 512 B, 2.0 KB, 5.0 MB. A kilobyte
// is 1024 bytes. Bytes carry no decimal, a kilobyte and a megabyte carry one.
export const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
