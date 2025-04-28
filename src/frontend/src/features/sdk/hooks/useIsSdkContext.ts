import { useLocation } from 'wouter'

const SDK_BASE_ROUTE = '/sdk'

export const useIsSdkContext = () => {
  const [location] = useLocation()
  return location.includes(SDK_BASE_ROUTE)
}
