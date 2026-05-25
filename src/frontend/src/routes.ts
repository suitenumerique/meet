import { flexibleRoomIdPattern } from '@/features/rooms'
import { ComponentType, lazy, LazyExoticComponent } from 'react'

const HomeRoute = lazy(() => import('@/features/home/routes/Home'))
const RecordingDownloadRoute = lazy(
  () => import('@/features/recording/routes/RecordingDownload')
)
const CreatePopup = lazy(() => import('@/features/sdk/routes/CreatePopup'))
const CreateMeetingButton = lazy(
  () => import('@/features/sdk/routes/CreateMeetingButton')
)
const LegalTermsRoute = lazy(
  () => import('@/features/legalsTerms/LegalTermsRoute')
)
const TermsOfServiceRoute = lazy(
  () => import('@/features/legalsTerms/TermsOfService')
)
const AccessibilityRoute = lazy(
  () => import('@/features/legalsTerms/Accessibility')
)
const RoomRoute = lazy(() => import('@/features/rooms/routes/Room'))
const FeedbackRoute = lazy(() => import('@/features/rooms/routes/Feedback'))

const roomIdRegex = new RegExp(`^[/](?<roomId>${flexibleRoomIdPattern})$`)

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
    Component: LazyExoticComponent<ComponentType>
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
    path: roomIdRegex,
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
