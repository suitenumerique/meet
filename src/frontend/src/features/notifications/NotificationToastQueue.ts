import { ToastQueue, type QueuedToast, type ToastOptions } from 'react-stately'
import type { Participant } from 'livekit-client'
import { NotificationType } from './NotificationType'
import type { ToastData } from './components/ToastProvider'

export const isNoisyNotification = (type: NotificationType) =>
  type === NotificationType.ParticipantJoined ||
  type === NotificationType.MessageReceived ||
  type === NotificationType.HandRaised

const MAX_VISIBLE = 5

/** Keep important prompts, but never build a hidden backlog of noisy toasts. */
export class NotificationToastQueue extends ToastQueue<ToastData> {
  private entries = new Map<string, QueuedToast<ToastData>>()
  private listeners = new Set<() => void>()

  constructor() {
    super({ maxVisibleToasts: MAX_VISIBLE })
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    const unsubscribe = super.subscribe(listener)
    return () => {
      this.listeners.delete(listener)
      unsubscribe()
    }
  }

  has(key: string) {
    return this.entries.has(key)
  }

  add(content: ToastData, options?: ToastOptions): string {
    const noisy = isNoisyNotification(content.type) && !options?.onClose
    if (noisy) {
      const existing = [...this.entries.values()].find(
        (toast) => toast.content.type === content.type && !toast.onClose
      )
      if (existing) {
        // Keep the key, focus and paused/remaining timeout when updating a batch.
        this.update(existing, content)
        return existing.key
      }
    }
    if (this.visibleToasts.length >= MAX_VISIBLE) {
      const oldestNoisy = [...this.visibleToasts]
        .reverse()
        .find(
          (toast) => isNoisyNotification(toast.content.type) && !toast.onClose
        )
      if (oldestNoisy) this.close(oldestNoisy.key)
      else if (noisy) return ''
      // All-important overflow stays queued rather than silently losing alerts.
    }
    const key = super.add(content, options)
    const toast = this.visibleToasts.find((item) => item.key === key)!
    this.entries.set(key, toast)
    return key
  }

  private update(toast: QueuedToast<ToastData>, content: ToastData) {
    toast.content = content
    this.visibleToasts = [...this.visibleToasts]
    for (const listener of this.listeners) listener()
  }

  close(key: string) {
    this.entries.get(key)?.timer?.pause()
    this.entries.delete(key)
    super.close(key)
  }

  /** Cancel obsolete prompts without executing their user-facing actions. */
  discardWhere(predicate: (content: ToastData) => boolean) {
    for (const toast of [...this.entries.values()]) {
      if (predicate(toast.content)) {
        toast.onClose = undefined
        this.close(toast.key)
      }
    }
  }

  removeParticipant(participant: Participant, type?: NotificationType) {
    for (const toast of [...this.entries.values()]) {
      const content = toast.content
      if (type && content.type !== type) continue
      if (!isNoisyNotification(content.type) || toast.onClose) continue
      if (
        (content.type === NotificationType.HandRaised ||
          content.type === NotificationType.ParticipantJoined) &&
        content.participants
      ) {
        const participants = content.participants.filter(
          (item) => item.identity !== participant.identity
        )
        if (participants.length === content.participants.length) continue
        if (participants.length) {
          this.update(toast, {
            ...content,
            participant: participants[0],
            participants,
            count: participants.length,
          })
          continue
        }
      } else if (
        content.participant?.identity !== participant.identity ||
        (content.count ?? 1) > 1
      )
        continue
      toast.onClose = undefined
      this.close(toast.key)
    }
  }

  clear() {
    for (const toast of this.entries.values()) toast.timer?.pause()
    this.entries.clear()
    super.clear()
  }
}
