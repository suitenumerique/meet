import { isMobileBrowser } from '@livekit/components-core'
import { useState } from 'react'

export const useIsMobile = () => {
  const [isMobile] = useState(() => isMobileBrowser())

  return isMobile
}
