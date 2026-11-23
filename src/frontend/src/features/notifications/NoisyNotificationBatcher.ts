import type { Participant } from 'livekit-client'
import { NotificationType } from './NotificationType'
import type { ToastData } from './components/ToastProvider'

const WINDOW_MS = 1000

type Batch = {
  content: ToastData
  key: string
  dirty: boolean
  timer: ReturnType<typeof setTimeout>
}

/** First event is immediate; subsequent events update that toast at most once/s. */
export class NoisyNotificationBatcher {
  private batches = new Map<NotificationType, Batch>()
  private lastPublished = new Map<NotificationType, number>()

  constructor(
    private publish: (content: ToastData, notify?: boolean) => string,
    private isActive: (key: string) => boolean
  ) {}

  add(content: ToastData) {
    let batch = this.batches.get(content.type)
    if (batch?.key && !this.isActive(batch.key)) {
      this.cancel(content.type)
      batch = undefined
    }
    if (batch) {
      const participants = batch.content.participants ?? []
      const duplicate = participants.some(
        (item) => item.identity === content.participant?.identity
      )
      if (content.type !== NotificationType.MessageReceived && duplicate) return
      batch.content = {
        ...content,
        participant:
          content.type === NotificationType.MessageReceived
            ? content.participant
            : batch.content.participant,
        count: (batch.content.count ?? 1) + 1,
        participants:
          content.participant && !duplicate
            ? [...participants, content.participant]
            : participants,
      }
      batch.dirty = true
      return
    }
    const first = {
      ...content,
      count: 1,
      participants: content.participant ? [content.participant] : [],
    }
    const previous = this.lastPublished.get(content.type)
    const delay =
      previous === undefined
        ? 0
        : Math.max(0, WINDOW_MS - (Date.now() - previous))
    // Dismissal/eviction discards old events, but must not bypass sound throttling.
    const key = delay ? '' : this.emit(first)
    if (!delay && !key) return
    this.batches.set(content.type, {
      content: first,
      key,
      dirty: !!delay,
      timer: setTimeout(() => this.flush(content.type), delay || WINDOW_MS),
    })
  }

  private emit(content: ToastData) {
    this.lastPublished.set(content.type, Date.now())
    return this.publish(content)
  }

  private flush(type: NotificationType) {
    const batch = this.batches.get(type)
    if (!batch) return
    if (!batch.dirty || (batch.key && !this.isActive(batch.key))) {
      this.cancel(type)
      return
    }
    batch.key = this.emit(batch.content)
    if (!batch.key) {
      this.cancel(type)
      return
    }
    batch.dirty = false
    batch.timer = setTimeout(() => this.flush(type), WINDOW_MS)
  }

  removeParticipant(participant: Participant, type?: NotificationType) {
    for (const [kind, batch] of this.batches) {
      if (type && kind !== type) continue
      if (batch.key && !this.isActive(batch.key)) {
        this.cancel(kind)
        continue
      }
      if (
        kind === NotificationType.HandRaised ||
        kind === NotificationType.ParticipantJoined
      ) {
        if (
          !batch.content.participants?.some(
            (item) => item.identity === participant.identity
          )
        )
          continue
        const participants =
          batch.content.participants?.filter(
            (item) => item.identity !== participant.identity
          ) ?? []
        if (!participants.length) this.cancel(kind)
        else {
          batch.content = {
            ...batch.content,
            participants,
            participant: participants[0],
            count: participants.length,
          }
          if (batch.key) {
            batch.key = this.publish(batch.content, false)
            batch.dirty = false
            if (!batch.key) this.cancel(kind)
          }
        }
      } else if (
        batch.content.participant?.identity === participant.identity &&
        batch.content.count === 1
      )
        this.cancel(kind)
    }
  }

  cancel(type: NotificationType) {
    const batch = this.batches.get(type)
    if (batch) clearTimeout(batch.timer)
    this.batches.delete(type)
  }

  clear() {
    for (const type of this.batches.keys()) this.cancel(type)
    this.lastPublished.clear()
  }
}
