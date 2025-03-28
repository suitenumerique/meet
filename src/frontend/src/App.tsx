import '@livekit/components-styles'
import '@/styles/index.css'
import { Suspense } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLang } from 'hoofd'
import { Switch, Route, useLocation } from 'wouter'
import { I18nProvider } from 'react-aria-components'
import { Layout } from './layout/Layout'
import { NotFoundScreen } from './components/NotFoundScreen'
import { routes } from './routes'
import './i18n/init'
import { queryClient } from '@/api/queryClient'
import { AppInitialization } from '@/components/AppInitialization'
import { SdkCreateButton } from './features/sdk/routes/CreateButton'

const SDK_BASE_ROUTE = '/sdk'

function App() {
  const { i18n } = useTranslation()
  useLang(i18n.language)

  const [location] = useLocation()
  const isSDKRoute = location.startsWith(SDK_BASE_ROUTE)

  if (isSDKRoute) {
    return (
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <I18nProvider locale={i18n.language}>
            <Switch>
              <Route path={SDK_BASE_ROUTE} nest>
                <Route path="/create-button">
                  <SdkCreateButton />
                </Route>
              </Route>
            </Switch>
          </I18nProvider>
        </Suspense>
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppInitialization />
      <Suspense fallback={null}>
        <I18nProvider locale={i18n.language}>
          <Layout>
            <Switch>
              {Object.entries(routes).map(([, route], i) => (
                <Route key={i} path={route.path} component={route.Component} />
              ))}
              <Route component={NotFoundScreen} />
            </Switch>
          </Layout>
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="bottom-left"
          />
        </I18nProvider>
      </Suspense>
    </QueryClientProvider>
  )
}

export default App
