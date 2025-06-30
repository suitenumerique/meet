import {
  FeedbackRoute,
  RoomRoute,
  flexibleRoomIdPattern,
} from '@/features/rooms'
import { HomeRoute } from '@/features/home'
import { LegalTermsRoute } from '@/features/legalsTerms/LegalTermsRoute'
import { AccessibilityRoute } from '@/features/legalsTerms/Accessibility'
import { TermsOfServiceRoute } from '@/features/legalsTerms/TermsOfService'
import { CreatePopup } from '@/features/sdk/routes/CreatePopup'
import { CreateMeetingButton } from '@/features/sdk/routes/CreateMeetingButton'
import { RecordingDownloadRoute } from '@/features/recording'

export const routes: Record<
  | 'home'
  | 'room'
  | 'feedback'
  | 'legalTerms'
  | 'accessibility'
  | 'termsOfService'
  | 'sdkCreatePopup'
  | 'sdkCreateButton'
  | 'recordingDownload',
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
    to: (roomId: string) => `/${roomId.trim()}`,
    path: new RegExp(`^[/](?<roomId>${flexibleRoomIdPattern})$`),
    Component: RoomRoute,
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
  recordingDownload: {
    name: 'recordingDownload',
    path: /^\/recording\/(?<recordingId>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    to: (recordingId: string) => `/recording/${recordingId.trim()}`,
    Component: RecordingDownloadRoute,
  },
}

export type RouteName = keyof typeof routes
