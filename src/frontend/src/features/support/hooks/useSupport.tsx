import { useEffect } from 'react'
import { Crisp } from 'crisp-sdk-web'
import { type ApiUser } from '@/features/auth/api/ApiUser'
import { useUser } from '@/features/auth/api/useUser'
import { useConfig } from '@/api/useConfig'

export const initializeSupportSession = (user: ApiUser) => {
  if (!Crisp.isCrispInjected()) return
  const { id, email } = user
  Crisp.setTokenId(`meet-${id}`)
  if (email) Crisp.user.setEmail(email)
}

export const terminateSupportSession = () => {
  if (!Crisp.isCrispInjected()) return
  Crisp.setTokenId()
  Crisp.session.reset()
}

export type useSupportProps = {
  id?: string
  isDisabled?: boolean
}

// Configure Crisp chat for real-time support across all pages.
export const useSupport = ({ id, isDisabled }: useSupportProps) => {
  const { user } = useUser()

  useEffect(() => {
    if (!id || Crisp.isCrispInjected() || isDisabled) return
    Crisp.configure(id)
    Crisp.setHideOnMobile(true)
  }, [id, isDisabled])

  useEffect(() => {
    if (!user) return
    initializeSupportSession(user)
  }, [user])

  return null
}

// Some users may block Crisp chat widget with browser ad blockers or anti-tracking plugins
// So we need to safely check if Crisp is available and not blocked
const isCrispAvailable = () => {
  try {
    return !!window?.$crisp?.is
  } catch {
    return false
  }
}

export const useIsSupportEnabled = () => {
  const { data } = useConfig()
  return !!data?.support?.id && isCrispAvailable()
}
