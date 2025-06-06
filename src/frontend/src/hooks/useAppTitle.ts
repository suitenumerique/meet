import { useEffect } from 'react'

export const useAppTitle = (title?: string, fallback = 'La Suite Meet') => {
  useEffect(() => {
    document.title = title || fallback
    return () => {
      document.title = fallback
    }
  }, [title, fallback])
}
