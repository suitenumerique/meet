/**
 * Konami Code Detector Component
 * This implementation is taken from: vmarchesin/react-konami-code
 */
import { useCallback, useEffect, useState } from 'react'

export const KONAMI_CODE = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]

function useKonami(action: () => void, { code = KONAMI_CODE } = {}) {
  const [input, setInput] = useState<number[]>([])

  const onKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const newInput = input
      newInput.push(e.keyCode)
      newInput.splice(-code.length - 1, input.length - code.length)

      setInput(newInput)

      if (newInput.join('').includes(code.join(''))) {
        action()
      }
    },
    [input, setInput, code, action]
  )

  useEffect(() => {
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [onKeyUp])
}

export default useKonami
