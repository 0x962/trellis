// True for a mime type the grid renders as a thumbnail. The allowlist holds
// raster images only. A browser runs the script inside an SVG, so an SVG on
// the app origin is stored XSS and never renders inline.
export const isThumbnailImage = (_mime: string): boolean => {
	throw new Error("isThumbnailImage is not implemented.");
};
