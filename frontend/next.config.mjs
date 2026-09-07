/** @type {import('next').NextConfig} */

// Under Docker Compose the API lives on another container, so the proxy target has
// to be configurable. Local development keeps working with no env var set.
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8001';

const ignoreBuildErrors = process.env.NEXT_IGNORE_BUILD_ERRORS === '1';

const nextConfig = {
  eslint: { ignoreDuringBuilds: ignoreBuildErrors },
  typescript: { ignoreBuildErrors },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/assets/:path*',
        destination: `${backendUrl}/assets/:path*`,
      },
    ];
  },
};

export default nextConfig;
