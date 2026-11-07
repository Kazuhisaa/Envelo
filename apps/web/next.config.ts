import type { NextConfig } from 'next'

const serverUrl = (process.env.SERVER_URL ?? 'http://localhost:8787').replace(/\/$/, '')

const config: NextConfig = {
  transpilePackages: ['@envelo/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${serverUrl}/:path*` }]
  },
}
export default config
