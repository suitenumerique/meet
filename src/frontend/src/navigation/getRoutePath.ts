import { type RouteName } from '@/routes'
import { getRouteByName } from './getRouteByName'

export const getRoutePath = (
  routeName: RouteName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any
) => {
  const route = getRouteByName(routeName)
  const to = route.to
    ? route.to(params)
    : typeof route.path === 'string'
      ? route.path
      : null
  if (!to) {
    throw new Error(`Can't find path to navigate to for ${routeName}`)
  }
  return to
}
