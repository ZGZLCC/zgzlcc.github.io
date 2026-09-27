export function pickHomePhoto(desktop: string[], mobile: string[], isMobile: boolean, previous: string): string | undefined {
  const preferred = isMobile ? mobile : desktop
  const photos = [...new Set(preferred.length ? preferred : isMobile ? desktop : mobile)]
  const fresh = photos.filter((photo) => photo !== previous)
  const pool = fresh.length ? fresh : photos
  return pool[Math.floor(Math.random() * pool.length)]
}
