// True for a mime type the grid renders as a thumbnail. The allowlist holds
// raster images only. A browser runs the script inside an SVG, so an SVG on
// the app origin is stored XSS and never renders inline.
const thumbnailMimes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

export const isThumbnailImage = (mime: string): boolean => thumbnailMimes.has(mime);
