import { useEffect, useState } from 'react'
import { css } from '@/styled-system/css'

const performanceIndicatorStyles = css({
  position: 'fixed',
  top: '10px',
  right: '10px',
  background: 'rgba(0, 0, 0, 0.8)',
  color: 'white',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '12px',
  fontFamily: 'monospace',
  zIndex: 1000,
  display: 'none',
  '&.show': {
    display: 'block',
  },
})

interface PerformanceMetrics {
  fps: number
  memory: number
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown'
}

export const PerformanceMonitor = ({ enabled = false }: { enabled?: boolean }) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    memory: 0,
    connectionQuality: 'unknown',
  })

  useEffect(() => {
    if (!enabled) return

    let frameCount = 0
    let lastTime = performance.now()
    let animationId: number

    const updateMetrics = () => {
      frameCount++
      const currentTime = performance.now()
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime))
        
        // Get memory usage if available
        const memory = (performance as any).memory 
          ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)
          : 0

        // Simple connection quality estimation based on FPS
        let connectionQuality: PerformanceMetrics['connectionQuality'] = 'unknown'
        if (fps >= 50) connectionQuality = 'excellent'
        else if (fps >= 30) connectionQuality = 'good'
        else connectionQuality = 'poor'

        setMetrics({ fps, memory, connectionQuality })
        
        frameCount = 0
        lastTime = currentTime
      }
      
      animationId = requestAnimationFrame(updateMetrics)
    }

    animationId = requestAnimationFrame(updateMetrics)

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [enabled])

  if (!enabled) return null

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return '#2ecc71'
      case 'good': return '#f39c12'
      case 'poor': return '#e74c3c'
      default: return '#95a5a6'
    }
  }

  return (
    <div className={`${performanceIndicatorStyles} ${enabled ? 'show' : ''}`}>
      <div>FPS: {metrics.fps}</div>
      {metrics.memory > 0 && <div>Memory: {metrics.memory}MB</div>}
      <div style={{ color: getQualityColor(metrics.connectionQuality) }}>
        Quality: {metrics.connectionQuality}
      </div>
    </div>
  )
}