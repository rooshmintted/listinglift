/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development'
    
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
              "connect-src 'self' https://vitals.vercel-insights.com https://*.supabase.co wss://*.supabase.co",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' http://fonts.gstatic.com",
              "style-src-elem 'self' 'unsafe-inline' http://fonts.googleapis.com"
            ].join('; ')
          }
        ]
      }
    ]
  }
}

export default nextConfig
