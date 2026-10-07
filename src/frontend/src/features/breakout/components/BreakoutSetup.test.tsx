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
import { breakoutSetupStore, resetBreakoutSetup } from '../store'
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
  queryClient.clear()
  resetBreakoutSetup()
  h.participants = []
  h.metadata = undefined
})

describe('BreakoutSetup', () => {
  it('takes a typed room count, kept between 2 and 20', async () => {
    renderSetup()
    const field = screen.getByRole('textbox', { name: 'roomCount' })
    for (const [typed, kept] of [
      ['30', 20],
      ['1', 2],
    ] as const) {
      fireEvent.change(field, { target: { value: typed } })
      fireEvent.blur(field)
      expect(breakoutSetupStore.roomCount).toBe(kept)
      await waitFor(() => expect(field).toHaveProperty('value', String(kept)))
    }
  })

  it('lists the host, who can be placed by hand', () => {
    renderSetup()
    expect(screen.getByText('setup.you')).toBeTruthy()
  })

  it('shuffles the guests alone, keeping a host placed by hand', async () => {
    h.participants = [guest]
    breakoutSetupStore.assignments = { me: 1 }
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'setup.shuffle' }))
    await waitFor(() =>
      expect({ ...breakoutSetupStore.assignments }).toEqual({
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
    breakoutSetupStore.assignments = { 'guest-1': 0 }
    renderSetup()
    const open = screen.getByRole('button', { name: 'setup.open' })
    expect(open.hasAttribute('disabled')).toBe(false)
  })

  it('warns that Open stops a running recording, and asks for it to stop', async () => {
    h.metadata = JSON.stringify({ recording_status: 'started' })
    h.participants = [guest]
    breakoutSetupStore.assignments = { 'guest-1': 0 }
    renderSetup()
    expect(screen.getByText('setup.recording')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'setup.open' }))
    await waitFor(() =>
      expect(createBreakoutSession).toHaveBeenLastCalledWith(
        'room-1',
        expect.objectContaining({ stop_recording: true })
      )
    )
  })

  it('sends the host by identity alone, "(you)" being shown and never sent', async () => {
    breakoutSetupStore.assignments = { me: 0 }
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'setup.open' }))
    await waitFor(() =>
      expect(createBreakoutSession).toHaveBeenLastCalledWith(
        'room-1',
        expect.objectContaining({
          rooms: expect.arrayContaining([
            {
              name: 'roomName',
              participants: [{ identity: 'me' }],
            },
          ]),
        })
      )
    )
  })

  it('opens without stopping anything when nothing records', async () => {
    h.participants = [guest]
    breakoutSetupStore.assignments = { 'guest-1': 0 }
    renderSetup()
    expect(screen.queryByText('setup.recording')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'setup.open' }))
    await waitFor(() =>
      expect(createBreakoutSession).toHaveBeenLastCalledWith(
        'room-1',
        expect.objectContaining({ stop_recording: false })
      )
    )
  })

  it('warns that anyone outside a browser stays in the main room, and lists none', () => {
    const caller = { ...guest, identity: 'sip-1', kind: ParticipantKind.SIP }
    h.participants = [guest, caller]
    renderSetup()
    expect(screen.getByText('setup.notInBrowser')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows no such warning when everyone is in a browser', () => {
    h.participants = [guest]
    renderSetup()
    expect(screen.queryByText('setup.notInBrowser')).toBeNull()
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
    const opened = { id: 's1', is_active: true, rooms: [] }
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
