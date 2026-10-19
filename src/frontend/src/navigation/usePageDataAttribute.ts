import { useEffect } from 'react'
import { matchRoute, useLocation, useRouter } from 'wouter'
import { proxy, useSnapshot } from 'valtio'
import { routes } from '@/routes'

const pageStore = proxy<{ override?: string }>({})

/**
 * Apply a [data-page] attribute on the html element, that matches
 * current route name, or a custom page name if provided.
 *
 * Used to allow easier customization of the app with custom CSS.
 *
 * This is meant to be used once without arguments in a wrapping component
 * that renders the whole app. And, on a case by case basis with a `page` argument
 * when needed.
 */
export const usePageDataAttribute = (page?: string) => {
  const router = useRouter()
  const [location] = useLocation()
  const { override } = useSnapshot(pageStore)

  useEffect(() => {
    if (page === undefined) return

    pageStore.override = page
    return () => {
      if (pageStore.override === page) {
        pageStore.override = undefined
      }
    }
  }, [page])

  const routeName = Object.values(routes).find(
    (route) => matchRoute(router.parser, route.path, location)[0]
  )?.name

  const pageName = page ?? override ?? routeName

  useEffect(() => {
    const root = document.documentElement

    if (pageName) {
      root.setAttribute('data-page', pageName)
    } else {
      root.removeAttribute('data-page')
    }
  }, [pageName])

  useEffect(() => {
    if (page !== undefined) return

    return () => {
      document.documentElement.removeAttribute('data-page')
    }
  }, [page])
}
