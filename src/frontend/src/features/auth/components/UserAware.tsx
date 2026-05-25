import { useUser } from '../api/useUser'
import { LoadingScreen } from '@/components/LoadingScreen'

/**
 * Renders a loading Screen while user info has not been fetched yet,
 * otherwise directly render children.
 *
 * Children usually contain a Screen at some point in the render tree.
 *
 * This is helpful to prevent flash of logged-out content for a few milliseconds when user is actually logged in
 */
export const UserAware = ({ children }: { children: React.ReactNode }) => {
  const { isLoggedIn } = useUser()

  return isLoggedIn !== undefined ? (
    children
  ) : (
    <LoadingScreen header={false} footer={false} delay={1000} />
  )
}
