// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ParticipantKind } from 'livekit-client'
import { queryClient } from '@/api/queryClient'
import { ApiError } from '@/api/ApiError'
import { BreakoutSetup } from './BreakoutSetup'
import { breakoutStore, resetBreakout } from '../store'
import { createBreakoutSession } from '../api'

const h = vi.hoisted(() => ({
  participants: [] as unknown[],
  metadata: undefined as string | undefined,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@livekit/components-react', () => ({
  useRemoteParticipants: () => h.participants,
  useLocalParticipant: () => ({
    localParticipant: {
      identity: 'me',
      name: 'Me',
      isLocal: true,
      kind: 0,
      attributes: { room_role: 'owner' },
    },
  }),
  useRoomInfo: () => ({ metadata: h.metadata }),
}))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  createBreakoutSession: vi.fn(async () => ({})),
}))

const guest = {
  identity: 'guest-1',
  name: 'Ann',
  isLocal: false,
  kind: ParticipantKind.STANDARD,
  attributes: { room_role: 'member' },
}

const renderSetup = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BreakoutSetup roomId="room-1" />
    </QueryClientProvider>
  )

afterEach(() => {
  cleanup()
  resetBreakout()
  h.participants = []
  h.metadata = undefined
})

describe('BreakoutSetup', () => {
  it('names the room-count selector for screen readers', () => {
    renderSetup()
    expect(
      screen.getByRole('button', { name: /setup\.roomCount/ })
    ).toBeTruthy()
  })

  it('lists the host, who can be placed by hand', () => {
    renderSetup()
    expect(screen.getByText('setup.you')).toBeTruthy()
  })

  it('shuffles the guests alone, keeping a host placed by hand', async () => {
    h.participants = [guest]
    breakoutStore.assignments = { me: 1 }
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'setup.shuffle' }))
    await waitFor(() =>
      expect({ ...breakoutStore.assignments }).toEqual({
        me: 1,
        'guest-1': 0,
      })
    )
  })

  it('keeps Open disabled until someone is assigned', async () => {
    h.participants = [guest]
    renderSetup()
    const open = screen.getByRole('button', { name: 'setup.open' })
    expect(open.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'setup.shuffle' }))
    await waitFor(() => expect(open.hasAttribute('disabled')).toBe(false))
  })

  it('opens with part of the meeting unassigned', () => {
    h.participants = [guest, { ...guest, identity: 'guest-2', name: 'Bo' }]
    breakoutStore.assignments = { 'guest-1': 0 }
    renderSetup()
    const open = screen.getByRole('button', { name: 'setup.open' })
    expect(open.hasAttribute('disabled')).toBe(false)
  })

  it('keeps Open disabled, and says why, while a recording runs', () => {
    h.metadata = JSON.stringify({ recording_status: 'started' })
    h.participants = [guest]
    breakoutStore.assignments = { 'guest-1': 0 }
    renderSetup()
    const open = screen.getByRole('button', { name: 'setup.open' })
    expect(open.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('setup.recording')).toBeTruthy()
  })

  it('keeps the plan when the panel closes and opens again', () => {
    h.participants = [guest]
    const { unmount } = renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'setup.shuffle' }))
    unmount()
    renderSetup()
    expect(screen.getByText('setup.allAssigned')).toBeTruthy()
  })

  it('shows the open rooms and starts a fresh plan once they are open', async () => {
    const opened = { id: 's1', status: 'active', rooms: [] }
    vi.mocked(createBreakoutSession).mockResolvedValueOnce(opened as never)
    h.participants = [guest]
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'setup.shuffle' }))
    await screen.findByText('setup.allAssigned')
    fireEvent.click(screen.getByRole('button', { name: 'setup.open' }))
    await waitFor(() =>
      expect(screen.queryByText('setup.unassigned')).not.toBeNull()
    )
    expect(queryClient.getQueryData(['breakoutSession', 'room-1'])).toBe(opened)
  })

  it('shows a refused Open and refetches the session it collided with', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    vi.mocked(createBreakoutSession).mockRejectedValueOnce(
      new ApiError(409, { detail: 'Already active.' })
    )
    h.participants = [guest]
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'setup.shuffle' }))
    await screen.findByText('setup.allAssigned')
    fireEvent.click(screen.getByRole('button', { name: 'setup.open' }))
    await screen.findByRole('alert')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['breakoutSession', 'room-1'],
    })
    invalidate.mockRestore()
  })
})
