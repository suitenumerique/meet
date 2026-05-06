import { useContext } from 'react'
import { EncryptionStatusContext } from './encryptionStatusContextValue'

export const useEncryptionStatus = () => useContext(EncryptionStatusContext)
