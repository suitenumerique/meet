/**
 * React context provider for the centralized encryption VaultClient SDK.
 *
 * The client SDK is loaded at runtime via a <script> tag from the vault domain
 * (data.encryption). This provider:
 * - Loads the client.js script from the vault URL
 * - Creates and initializes the VaultClient instance
 * - Sets auth context when the user logs in
 * - Tracks key state (hasKeys, publicKey)
 * - Provides the client to all downstream components
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'

export interface VaultClientContextValue {
  client: VaultClient | null
  isReady: boolean
  isLoading: boolean
  error: string | null
  hasKeys: boolean | null
  publicKey: ArrayBuffer | null
  refreshKeyState: () => Promise<void>
}

const VaultClientContext = createContext<VaultClientContextValue>({
  client: null,
  isReady: false,
  isLoading: true,
  error: null,
  hasKeys: null,
  publicKey: null,
  refreshKeyState: async () => {},
})

function loadClientScript(vaultUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.EncryptionClient?.VaultClient) {
      resolve()
      return
    }

    const scriptSrc = `${vaultUrl}/client.js`
    const existing = document.querySelector(`script[src="${scriptSrc}"]`)

    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load encryption client SDK'))
      )
      return
    }

    const script = document.createElement('script')
    script.src = scriptSrc
    script.async = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('Failed to load encryption client SDK'))
    document.head.appendChild(script)
  })
}

export function VaultClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: config } = useConfig()
  const { i18n } = useTranslation()
  const clientRef = useRef<VaultClient | null>(null)
  const [clientInitialized, setClientInitialized] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasKeys, setHasKeys] = useState<boolean | null>(null)
  const [publicKey, setPublicKey] = useState<ArrayBuffer | null>(null)
  const initRef = useRef(false)

  const vaultUrl = config?.encryption?.vault_url
  const interfaceUrl = config?.encryption?.interface_url

  // Load script + initialize VaultClient once
  useEffect(() => {
    if (initRef.current || !vaultUrl || !interfaceUrl) return
    initRef.current = true

    let destroyed = false

    async function init() {
      try {
        await loadClientScript(vaultUrl!)

        if (destroyed) return

        const client = new window.EncryptionClient.VaultClient({
          vaultUrl: vaultUrl!,
          interfaceUrl: interfaceUrl!,
          lang: i18n.language,
        })

        clientRef.current = client

        client.on('onboarding:complete', () => {
          setHasKeys(true)
          client
            .getPublicKey()
            .then(({ publicKey: pk }) => setPublicKey(pk))
            .catch(() => {})
        })

        client.on('keys-changed', () => {
          client
            .hasKeys()
            .then(({ hasKeys: exists }) => {
              setHasKeys(exists)
              if (exists) {
                client
                  .getPublicKey()
                  .then(({ publicKey: pk }) => setPublicKey(pk))
                  .catch(() => {})
              }
            })
            .catch(() => {})
        })

        client.on('keys-destroyed', () => {
          setHasKeys(false)
          setPublicKey(null)
        })

        await client.init()

        if (destroyed) {
          client.destroy()
        } else {
          setClientInitialized(true)
        }
      } catch (err) {
        if (!destroyed) {
          setError((err as Error).message)
          setIsLoading(false)
        }
      }
    }

    void init()

    return () => {
      destroyed = true
      if (clientRef.current) {
        clientRef.current.destroy()
        clientRef.current = null
      }
    }
  }, [vaultUrl, interfaceUrl, i18n.language])

  // Set auth context when user is available
  // Note: Meet may have anonymous users — VaultClient only works for authenticated users
  // with a suite_user_id. For anonymous users, isReady stays false.
  useEffect(() => {
    const client = clientRef.current
    if (!client || !clientInitialized) {
      return
    }

    // For now, mark as ready without auth context.
    // Auth context will be set when we have a suite_user_id.
    setIsReady(true)
    setIsLoading(false)
  }, [clientInitialized])

  const refreshKeyState = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    try {
      const { hasKeys: exists } = await client.hasKeys()
      setHasKeys(exists)
      if (exists) {
        const { publicKey: pk } = await client.getPublicKey()
        setPublicKey(pk)
      } else {
        setPublicKey(null)
      }
    } catch {
      // Vault not available
    }
  }, [])

  return (
    <VaultClientContext.Provider
      value={{
        client: isReady ? clientRef.current : null,
        isReady,
        isLoading,
        error,
        hasKeys,
        publicKey,
        refreshKeyState,
      }}
    >
      {children}
    </VaultClientContext.Provider>
  )
}

export const useVaultClient = (): VaultClientContextValue =>
  useContext(VaultClientContext)
