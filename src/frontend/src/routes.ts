import { FeedbackRoute, RoomRoute, roomIdPattern } from '@/features/rooms'
import { HomeRoute } from '@/features/home'
import { LegalTermsRoute } from '@/features/legalsTerms/LegalTermsRoute'
import { AccessibilityRoute } from '@/features/legalsTerms/Accessibility'
import { TermsOfServiceRoute } from '@/features/legalsTerms/TermsOfService'
import { CreatePopup } from '@/features/sdk/routes/CreatePopup'
import { CreateMeetingButton } from '@/features/sdk/routes/CreateMeetingButton'
import { DownloadRoute, RecordingRoute } from '@/features/recording'

export const routes: Record<
  | 'home'
  | 'room'
  | 'feedback'
  | 'legalTerms'
  | 'accessibility'
  | 'termsOfService'
  | 'sdkCreatePopup'
  | 'sdkCreateButton',
  {
    name: RouteName
    path: RegExp | string
    Component: () => JSX.Element
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    to?: (...args: any[]) => string | URL
  }
> = {
  home: {
    name: 'home',
    path: '/',
    Component: HomeRoute,
  },
  room: {
    name: 'room',
    path: new RegExp(`^[/](?<roomId>${roomIdPattern})$`),
    to: (roomId: string) => `/${roomId.trim()}`,
    Component: RoomRoute,
  },
  recording: {
    name: 'recording',
    path: new RegExp(
      `^[/]recording[/](?<recordingId>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`
    ),
    to: (recordingId: string) => `/recording/${recordingId.trim()}`,
    Component: RecordingRoute,
  },
  feedback: {
    name: 'feedback',
    path: '/feedback',
    Component: FeedbackRoute,
  },
  legalTerms: {
    name: 'legalTerms',
    path: '/mentions-legales',
    Component: LegalTermsRoute,
  },
  accessibility: {
    name: 'accessibility',
    path: '/accessibilite',
    Component: AccessibilityRoute,
  },
  termsOfService: {
    name: 'termsOfService',
    path: '/conditions-utilisation',
    Component: TermsOfServiceRoute,
  },
  sdkCreatePopup: {
    name: 'sdkCreatePopup',
    path: '/sdk/create-popup',
    Component: CreatePopup,
  },
  sdkCreateButton: {
    name: 'sdkCreateButton',
    path: '/sdk/create-button',
    Component: CreateMeetingButton,
  },
}

export type RouteName = keyof typeof routes
