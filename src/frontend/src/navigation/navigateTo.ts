import { RouteName } from '@/routes'
import { navigate } from 'wouter/use-browser-location'
import { getRouteByName } from './getRouteByName'

export const navigateTo = <S = unknown>(
  routeName: RouteName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any,
  options?: { replace?: boolean; state?: S; hash?: string }
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
  // Including the hash in the URL passed to `navigate` lets us avoid a
  // brittle pushState + replaceState dance at the call site: the URL the
  // app first renders already carries the fragment.
  const target = options?.hash ? `${to}#${options.hash}` : to
  const { hash: _hash, ...navigateOptions } = options ?? {}
  void _hash
  return navigate(target, navigateOptions)
}
