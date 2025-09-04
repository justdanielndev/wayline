const { getDefaultConfig } = require("expo/metro-config");

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  const { assetExts, sourceExts } = config.resolver;

  config.transformer = {
    ...config.transformer,
    babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
    assetPlugins: ['expo-asset/tools/hashAssetFiles'],
    minifierConfig: {
      keep_fnames: true,
      mangle: {
        keep_fnames: true,
      },
      compress: {
        drop_console: true,
      },
    },
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  };

  config.resolver = {
    ...config.resolver,
    assetExts: assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...sourceExts, "svg"],
  };

  return config;
})();
