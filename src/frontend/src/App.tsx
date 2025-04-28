import '@livekit/components-styles'
import '@/styles/index.css'
import { Suspense } from 'react'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLang } from 'hoofd'
import { Switch, Route } from 'wouter'
import { I18nProvider } from 'react-aria-components'
import { Layout } from './layout/Layout'
import { NotFoundScreen } from './components/NotFoundScreen'
import { routes } from './routes'
import './i18n/init'
import { queryClient } from '@/api/queryClient'
import { AppInitialization } from '@/components/AppInitialization'
import { useIsSdkContext } from '@/features/sdk/hooks/useIsSdkContext'

function App() {
  const { i18n } = useTranslation()
  useLang(i18n.language)

  const isSDKContext = useIsSdkContext()

  return (
    <QueryClientProvider client={queryClient}>
      {!isSDKContext && <AppInitialization />}
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
