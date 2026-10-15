import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageOff, LoaderCircle } from 'lucide-react'
import type { GlobalSearchResult } from '../api/search'
import { recoverPreview } from '../api/previews'

export default function ResultPreview({ result, onResolved }: { result: GlobalSearchResult; onResolved?: (url: string) => void }) {
  const root = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const [recovered, setRecovered] = useState<string[]>([])
  const [attempted, setAttempted] = useState(false)
  const [loading, setLoading] = useState(false)
  const notified = useRef<string | null>(null)
  const candidates = useMemo(() => {
    const urls = [result.imageUrl, ...(result.previewUrls || []), ...(result.gallery || []), ...recovered].map(value => {
      if (!value || typeof value !== 'string') return null
      try { const url = new URL(value, result.sourceUrl); return ['https:', 'http:'].includes(url.protocol) ? url.href : null } catch { return null }
    }).filter((url): url is string => Boolean(url))
    return [...new Set(urls)]
  }, [result.imageUrl, result.previewUrls, result.gallery, result.sourceUrl, recovered])
  const src = candidates.find(url => !failed.includes(url))

  useEffect(() => {
    if (!root.current) return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || src || attempted) return
    const controller = new AbortController()
    setLoading(true)
    recoverPreview(result, controller.signal).then(images => {
      if (!controller.signal.aborted) setRecovered(images)
    }).catch(() => {}).finally(() => {
      if (!controller.signal.aborted) { setLoading(false); setAttempted(true) }
    })
    return () => controller.abort()
  }, [visible, src, attempted, result.sourceId, result.sourceUrl])

  return <span className="resultPreview" ref={root}>
    {src ? <img key={src} src={src} alt={result.title} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onLoad={() => { if (notified.current !== src) { notified.current = src; onResolved?.(src) } }}
      onError={() => setFailed(current => [...current, src])}/>
      : <span className="imageFallback show">{loading ? <LoaderCircle size={24} className="spin"/> : <ImageOff size={29}/>}<small>{loading ? 'BUSCANDO PREVIEW' : 'SEM PREVIEW'}</small></span>}
  </span>
}
