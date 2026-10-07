module.exports = {
	sourceLocale: "en",
	locales: ["en"],
	catalogs: [{ path: "./upstream/packages/i18n/locales/{locale}/messages", include: ["./upstream/apps/mobile"] }],
};
