/* eslint-disable @next/next/no-img-element */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <img src="/logo-mark.png" width={size} height={size} alt="Terraviva" style={{ display: 'block', objectFit: 'contain' }} />
}

export function LogoFull({ width = 170 }: { width?: number }) {
  return <img src="/logo.png" width={width} alt="Terraviva" style={{ display: 'block', height: 'auto', margin: '0 auto 6px' }} />
}
