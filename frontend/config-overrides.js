const webpack = require('webpack');
const path = require('path');

module.exports = function override(config) {
  // Add fallbacks for node.js core modules
  const fallback = {
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    zlib: require.resolve('browserify-zlib'),
    assert: require.resolve('assert/'),
    url: require.resolve('url/'),
    os: require.resolve('os-browserify/browser'),
    buffer: require.resolve('buffer/'),
    path: require.resolve('path-browserify'),
    fs: false,
    net: false,
  };

  // Make sure resolve.fallback exists
  config.resolve = config.resolve || {};
  config.resolve.fallback = {
    ...config.resolve.fallback,
    ...fallback
  };

  // Add plugins
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
    // Fix for axios
    new webpack.DefinePlugin({
      'process.env': JSON.stringify(process.env)
    }),
    new webpack.NormalModuleReplacementPlugin(
      /node:crypto/,
      resource => {
        resource.request = 'crypto-browserify';
      }
    )
  ];

  // Add process/browser alias
  config.resolve.alias = {
    ...config.resolve.alias,
    'process/browser': require.resolve('process/browser')
  };
  
  // Add resolveLoader to handle process/browser
  config.resolveLoader = {
    ...config.resolveLoader,
    modules: [
      'node_modules',
      path.resolve(__dirname, 'node_modules')
    ]
  };

  // Ignore source-map warnings from superstruct
  config.ignoreWarnings = [
    function ignoreSourcemapsloaderWarnings(warning) {
      return (
        warning.module &&
        warning.module.resource &&
        (warning.module.resource.includes('superstruct') || 
         warning.module.resource.includes('@metamask'))
      );
    }
  ];

  return config;
};