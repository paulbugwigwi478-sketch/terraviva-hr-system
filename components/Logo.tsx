/* eslint-disable @next/next/no-img-element */
import { LOGO_MARK } from '@/lib/logos'

export function LogoMark({ size = 40 }: { size?: number }) {
  return <img src={LOGO_MARK} width={size} height={size} alt="Terraviva" style={{ display: 'block', objectFit: 'contain' }} />
}

export function LogoFull({ width = 170 }: { width?: number }) {
  const mark = Math.round(width * 0.6)
  return (
    <div style={{ textAlign: 'center', margin: '0 auto 8px' }}>
      <img src={LOGO_MARK} width={mark} height={mark} alt="Terraviva" style={{ display: 'block', margin: '0 auto' }} />
      <div style={{ marginTop: 6, fontWeight: 800, letterSpacing: '0.14em', color: '#087f82', fontSize: Math.round(width * 0.13) }}>TERRAVIVA</div>
    </div>
  )
}
