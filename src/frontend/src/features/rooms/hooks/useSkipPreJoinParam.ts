import { useSearch } from 'wouter'

export const useSkipPreJoinParam = () => {
  const search = useSearch()
  const params = new URLSearchParams(search)
  return params.get('skipPreJoin') === 'True'
}
