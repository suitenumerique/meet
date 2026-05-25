import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'

export const AdminOrOwnerOnly = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const isAdminOrOwner = useIsAdminOrOwner()
  if (!isAdminOrOwner) return null
  return children
}
