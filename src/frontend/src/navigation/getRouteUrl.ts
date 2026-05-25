import { type RouteName } from '@/routes'
import { getRoutePath } from './getRoutePath'

export const getRouteUrl = (
  routeName: RouteName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any
) => {
  const to = getRoutePath(routeName, params)
  return `${window.location.origin}${to}`
}
