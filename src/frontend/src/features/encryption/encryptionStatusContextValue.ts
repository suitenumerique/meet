import { createContext } from 'react'
import {
  EncryptionPhase,
  EncryptionStatusContextValue,
} from './encryptionStatusTypes'

const noopContext: EncryptionStatusContextValue = {
  phase: EncryptionPhase.UNENCRYPTED,
  pausedByMe: false,
  pauseEncryption: async () => false,
  resumeEncryption: async () => false,
}

export const EncryptionStatusContext =
  createContext<EncryptionStatusContextValue>(noopContext)
