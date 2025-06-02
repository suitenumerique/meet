import { useSearch } from 'wouter'

export const useUsernameParam = () => {
  const search = useSearch()
  const params = new URLSearchParams(search)
  return params.get('username')
}
