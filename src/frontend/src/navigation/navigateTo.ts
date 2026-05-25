import { type RouteName } from '@/routes'
import { navigate } from 'wouter/use-browser-location'
import { getRouteByName } from './getRouteByName'

export const navigateTo = <S = unknown>(
  routeName: RouteName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any,
  options?: { replace?: boolean; state?: S }
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
  return navigate(to, options)
}
