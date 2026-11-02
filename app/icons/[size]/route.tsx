/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'
import { ICON_LOGO } from '@/lib/icon-logo'

// Draws the app icon: the Terraviva emblem on a cream square. ?maskable=1 leaves extra room for phones that crop icons into circles.
export async function GET(request: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params
  const size = [180, 192, 512].includes(Number(raw)) ? Number(raw) : 512
  const maskable = new URL(request.url).searchParams.get('maskable') === '1'
  const inner = Math.round(size * (maskable ? 0.56 : 0.8))
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fffef1' }}>
        <img src={ICON_LOGO} width={inner} height={inner} alt="" />
      </div>
    ),
    { width: size, height: size },
  )
}
