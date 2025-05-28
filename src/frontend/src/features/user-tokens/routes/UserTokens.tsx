import React, { useCallback, useEffect, useState } from 'react'
import { createUserToken, deleteUserToken, listUserTokens } from '../api/index'
import { NewUserToken, UserToken } from '../types'
import { H, Button } from '@/primitives'

// Add id to UserToken type for table compatibility
interface UserTokenWithId extends UserToken {
  id: string
}

export const UserTokens: React.FC = () => {
  const [tokens, setTokens] = useState<UserTokenWithId[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<NewUserToken | null>(null)
  const [modal, setModal] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  })

  const fetchTokens = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const fetchedTokens = await listUserTokens()
      setTokens(fetchedTokens.map((token) => ({ ...token, id: token.digest })))
    } catch (err) {
      setError(
        'Failed to fetch tokens. Please ensure you are logged in and have permissions.'
      )
      setModal({ open: true, message: 'Failed to fetch tokens' })
      console.error(err)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void fetchTokens()
  }, [fetchTokens])

  const handleCreateToken = async () => {
    setIsLoading(true)
    setError(null)
    setNewToken(null)
    try {
      const generatedToken = await createUserToken()
      setNewToken(generatedToken)
      setModal({
        open: true,
        message:
          'Token created successfully! Store the token key safely, it will not be shown again.',
      })
      void fetchTokens()
    } catch (err) {
      setError('Failed to create token.')
      setModal({ open: true, message: 'Failed to create token' })
      console.error(err)
    }
    setIsLoading(false)
  }

  const handleDeleteToken = async (digest: string) => {
    if (!window.confirm('Are you sure you want to delete this token?')) return
    setIsLoading(true)
    setError(null)
    try {
      await deleteUserToken({ digest })
      setModal({ open: true, message: 'Token deleted successfully!' })
      setNewToken(null)
      await fetchTokens()
    } catch (err) {
      setError('Failed to delete token.')
      setModal({ open: true, message: 'Failed to delete token' })
      console.error(err)
    }
    setIsLoading(false)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        padding: '16px 24px 24px 24px',
        boxSizing: 'border-box',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <H lvl={2} style={{ marginBottom: 16 }}>
          User token management
        </H>
        <Button
          onPress={handleCreateToken}
          isDisabled={isLoading}
          variant="primary"
        >
          {isLoading ? 'Generating...' : 'Generate New Token'}
        </Button>
      </div>
      {newToken && (
        <div
          style={{
            background: '#e6f4ea',
            padding: 16,
            borderRadius: 10,
            marginBottom: 16,
            marginTop: 16,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span style={{ marginLeft: 16 }}>
            <strong>New Token:</strong> <code>{newToken.token_key}</code>
          </span>
          <span style={{ marginLeft: 16 }}>
            <strong>Digest:</strong> <code>{newToken.digest}</code>
          </span>
          <span style={{ marginLeft: 16 }}>
            <strong>Expires:</strong>{' '}
            <code>{new Date(newToken.expiry).toLocaleString()}</code>
          </span>
        </div>
      )}
      {isLoading && !tokens.length && (
        <div style={{ marginBottom: 8 }}>Loading...</div>
      )}
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <table
        style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8 }}>Name</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Updated at</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Expires at</th>
            <th style={{ textAlign: 'left', padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {tokens.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', padding: 16 }}>
                No tokens found.
              </td>
            </tr>
          ) : (
            tokens.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: 8 }}>{row.digest}</td>
                <td style={{ padding: 8 }}>
                  {new Date(row.created).toLocaleString()}
                </td>
                <td style={{ padding: 8 }}>
                  {new Date(row.expiry).toLocaleString()}
                </td>
                <td style={{ padding: 8 }}>
                  <Button
                    onPress={() => handleDeleteToken(row.digest)}
                    variant="danger"
                    size="sm"
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {modal.open && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#eee',
            borderRadius: 8,
          }}
        >
          <span>{modal.message}</span>
          <Button
            onPress={() => setModal({ open: false, message: '' })}
            variant="secondary"
            size="sm"
            style={{ marginLeft: 16 }}
          >
            Close
          </Button>
        </div>
      )}
    </div>
  )
}
