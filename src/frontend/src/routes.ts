import { FeedbackRoute, RoomRoute, roomIdPattern } from '@/features/rooms'
import { HomeRoute } from '@/features/home'
import { LegalTermsRoute } from '@/features/legalsTerms/LegalTermsRoute'
import { AccessibilityRoute } from '@/features/legalsTerms/Accessibility'

export const routes: Record<
  'home' | 'room' | 'feedback' | 'legalTerms' | 'accessibility',
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
}

export type RouteName = keyof typeof routes
