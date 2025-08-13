/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // This is the crucial line that fixes the module-not-found error
    config.resolve.alias['pdfjs-dist/legacy/build/pdf.mjs'] = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');

    return config;
  },
};

module.exports = nextConfig;
