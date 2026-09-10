import { useEffect, useState } from 'react'
import { type ApiUser } from '@/features/auth/api/ApiUser'
import { useUser } from '@/features/auth/api/useUser'
import { useConfig } from '@/api/useConfig'

type CrispSdk = (typeof import('crisp-sdk-web'))['Crisp']

let crisp: CrispSdk | undefined
let crispPromise: Promise<CrispSdk> | undefined

const loadCrisp = (): Promise<CrispSdk> => {
  crispPromise ??= import('crisp-sdk-web')
    .then((module) => {
      crisp = module.Crisp
      return module.Crisp
    })
    .catch((error) => {
      crispPromise = undefined
      throw error
    })

  return crispPromise
}

export const openSupportChat = () => {
  if (!crisp?.isCrispInjected()) return
  crisp.chat.open()
}

export const initializeSupportSession = (user: ApiUser) => {
  if (!crisp?.isCrispInjected()) return

  const { id, email } = user
  crisp.setTokenId(`meet-${id}`)
  if (email) crisp.user.setEmail(email)
}

export const terminateSupportSession = () => {
  if (!crisp?.isCrispInjected()) return

  crisp.setTokenId()
  crisp.session.reset()
}

export type useSupportProps = {
  id?: string
  isDisabled?: boolean
}

const IDLE_TIMEOUT_MS = 10_000

const scheduleWhenIdle = (callback: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, {
      timeout: IDLE_TIMEOUT_MS,
    })
    return () => window.cancelIdleCallback(handle)
  }

  const handle = window.setTimeout(callback, 1)
  return () => window.clearTimeout(handle)
}

export const useSupport = ({ id, isDisabled }: useSupportProps) => {
  const { user } = useUser()
  const [isInjected, setIsInjected] = useState(
    () => crisp?.isCrispInjected() ?? false
  )

  useEffect(() => {
    if (!id || isDisabled) return

    if (crisp?.isCrispInjected()) {
      setIsInjected(true)
      return
    }

    let cancelled = false

    const cancelIdle = scheduleWhenIdle(() => {
      void loadCrisp()
        .then((sdk) => {
          if (cancelled) return

          if (!sdk.isCrispInjected()) {
            sdk.configure(id)
            sdk.setHideOnMobile(true)
          }

          setIsInjected(true)
        })
        .catch((error) => {
          if (!cancelled) {
            console.error('Failed to initialize support chat', error)
          }
        })
    })

    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [id, isDisabled])

  useEffect(() => {
    if (!user || !isInjected || isDisabled) return
    initializeSupportSession(user)
  }, [user, isInjected, isDisabled])

  return null
}

// Some users block the chat widget, so check its availability safely.
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
