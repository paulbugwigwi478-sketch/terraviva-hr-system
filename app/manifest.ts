import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Terraviva HR System',
    short_name: 'Terraviva HR',
    description: 'Terraviva employee records, leave, attendance, payroll and performance.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fffef1',
    theme_color: '#087f82',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
