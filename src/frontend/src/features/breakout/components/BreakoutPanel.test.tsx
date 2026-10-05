// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { queryClient } from '@/api/queryClient'
import { ApiError } from '@/api/ApiError'
import { BreakoutPanel } from './BreakoutPanel'
import { closeBreakoutSession, fetchBreakoutSession } from '../api'

const h = vi.hoisted(() => ({
  metadata: '',
  config: { breakout_rooms: { is_enabled: true } } as object,
  remotes: [] as { identity: string }[],
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@livekit/components-react', () => ({
  useRoomInfo: () => ({ metadata: h.metadata }),
  useRoomContext: () => ({ localParticipant: { identity: 'host' } }),
  useRemoteParticipants: () => h.remotes,
  useLocalParticipant: () => ({ localParticipant: { identity: 'host' } }),
}))
vi.mock('@/api/useConfig', () => ({ useConfig: () => ({ data: h.config }) }))
vi.mock('@/features/rooms/livekit/hooks/useIsAdminOrOwner', () => ({
  useIsAdminOrOwner: () => true,
}))
vi.mock('@/features/rooms/livekit/hooks/useRoomData', () => ({
  useRoomData: () => ({ id: 'room-1' }),
}))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchBreakoutSession: vi.fn(),
  closeBreakoutSession: vi.fn(async () => ({})),
}))

const announce = (sessionId: string | null) => {
  h.metadata = sessionId
    ? JSON.stringify({
        breakout: { session_id: sessionId, rooms: [], assignments: {} },
      })
    : ''
}

const ui = () => (
  <QueryClientProvider client={queryClient}>
    <BreakoutPanel />
  </QueryClientProvider>
)

const session = {
  id: 's1',
  status: 'active' as const,
  rooms: [{ id: 'r1', name: 'Room 1', participants: [] }],
}

afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.mocked(fetchBreakoutSession).mockReset()
  h.config = { breakout_rooms: { is_enabled: true } }
})

describe('BreakoutPanel', () => {
  it('lists the people still connected, not one who left', async () => {
    h.remotes = [{ identity: 'alice' }]
    vi.mocked(fetchBreakoutSession).mockResolvedValueOnce({
      ...session,
      rooms: [
        {
          id: 'r1',
          name: 'Room 1',
          participants: [
            { identity: 'alice', name: 'Alice' },
            { identity: 'gone', name: 'Ghost' },
          ],
        },
      ],
    })
    render(ui())
    expect(await screen.findByText('Alice')).toBeTruthy()
    expect(screen.queryByText(/Ghost/)).toBeNull()
    h.remotes = []
  })

  it('offers close with the flag off', async () => {
    h.config = { breakout_rooms: { is_enabled: false } }
    vi.mocked(fetchBreakoutSession).mockResolvedValueOnce(session)
    render(ui())
    expect(
      await screen.findByRole('button', { name: 'active.close' })
    ).toBeTruthy()
  })

  it('offers no Open with the flag off', async () => {
    h.config = { breakout_rooms: { is_enabled: false } }
    vi.mocked(fetchBreakoutSession).mockResolvedValueOnce(null)
    render(ui())
    await waitFor(() =>
      expect(
        queryClient.getQueryState(['breakoutSession', 'room-1'])?.status
      ).toBe('success')
    )
    expect(screen.queryByRole('button', { name: 'setup.open' })).toBeNull()
  })

  it('shows an error, and no form, when the list fails otherwise', async () => {
    vi.mocked(fetchBreakoutSession).mockRejectedValue(
      new ApiError(503, { detail: 'Unavailable.' })
    )
    render(ui())
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'active.close' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'setup.open' })).toBeNull()
  })

  it('keeps the session and a running close when the split leaves the metadata', async () => {
    // Opened from the panel: the list answered no session first.
    announce(null)
    vi.mocked(fetchBreakoutSession).mockResolvedValueOnce(null)
    const { rerender } = render(ui())
    await screen.findByRole('button', { name: 'setup.open' })
    announce('s1')
    vi.mocked(fetchBreakoutSession).mockResolvedValueOnce(session)
    rerender(ui())
    const close = await screen.findByRole('button', { name: 'active.close' })

    vi.mocked(closeBreakoutSession).mockReturnValueOnce(new Promise(() => {}))
    fireEvent.click(close)
    await waitFor(() => expect(close.hasAttribute('disabled')).toBe(true))
    // The split leaves the metadata before the close answers: the session stays shown.
    vi.mocked(fetchBreakoutSession).mockResolvedValueOnce(session)
    announce(null)
    rerender(ui())
    await waitFor(() => expect(fetchBreakoutSession).toHaveBeenCalledTimes(3))
    expect(screen.queryByRole('button', { name: 'setup.open' })).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'active.close' })
        .hasAttribute('disabled')
    ).toBe(true)
  })

  it('keeps the session with an error when a later refetch fails', async () => {
    announce('s1')
    vi.mocked(fetchBreakoutSession).mockResolvedValueOnce(session)
    render(ui())
    await screen.findByRole('button', { name: 'active.close' })
    vi.mocked(fetchBreakoutSession).mockRejectedValueOnce(
      new ApiError(503, { detail: 'Service unavailable.' })
    )
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'active.close' })).toBeTruthy()
  })

  it('shows a failed close and lets the host close again', async () => {
    announce('s1')
    vi.mocked(fetchBreakoutSession).mockResolvedValue(session)
    render(ui())
    const close = await screen.findByRole('button', { name: 'active.close' })
    vi.mocked(closeBreakoutSession).mockRejectedValueOnce(
      new ApiError(503, { detail: 'Service unavailable.' })
    )
    fireEvent.click(close)
    await screen.findByRole('alert')
    await waitFor(() => expect(close.hasAttribute('disabled')).toBe(false))
  })
})
