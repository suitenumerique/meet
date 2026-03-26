import { RouteName } from '@/routes'
import { getRoutePath } from './getRoutePath'

export const getRouteUrl = (
  routeName: RouteName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any
) => {
  const to = getRoutePath(routeName, params)
  // Twake override
  if (window?.twake?.twakeOrigin) {
    return `${window.twake.twakeOrigin}${to}`
  }

  return `${window.location.origin}${to}`
}
