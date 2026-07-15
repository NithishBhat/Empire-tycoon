export const fmt = (n) => {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e21) return `${sign}$${(abs / 1e21).toFixed(2)}Sx`
  if (abs >= 1e18) return `${sign}$${(abs / 1e18).toFixed(2)}Qi`
  if (abs >= 1e15) return `${sign}$${(abs / 1e15).toFixed(2)}Q`
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}K`
  if (abs >= 100) return `${sign}$${Math.round(abs).toLocaleString()}`
  return `${sign}$${abs.toFixed(2)}`
}
