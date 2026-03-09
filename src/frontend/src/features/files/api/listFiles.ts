import { fetchApi } from '@/api/fetchApi'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import {
  ApiFileItem,
  ApiFileType,
  ApiFileUploadState,
} from '@/features/files/api/types.ts'
import { useUser } from '@/features/auth'

type ListFilesResponse = {
  count: number
  next: string | null
  previous: string | null
  results: ApiFileItem[]
}

type ListFilesFilters = {
  is_creator_me?: boolean
  type?: ApiFileType
  upload_state?: ApiFileUploadState
  is_deleted?: boolean
}

export type ListFilesParams = {
  filters?: ListFilesFilters
  pagination: {
    page: number
    pageSize: number
  }
}

export const listMyFiles = async ({
  filters = {},
  pagination: { page, pageSize },
}: ListFilesParams): Promise<ListFilesResponse> => {
  const query = new URLSearchParams()
  query.append('page', page.toString())
  query.append('page_size', pageSize.toString())
  if (filters?.is_creator_me ?? true) {
    query.append('is_creator_me', 'true')
  }
  if (filters?.type) {
    query.append('type', filters.type)
  }
  if (filters?.upload_state) {
    query.append('upload_state', filters.upload_state)
  }
  if (typeof filters?.is_deleted === 'boolean') {
    query.append('is_deleted', filters.is_deleted ? 'true' : 'false')
  }

  return fetchApi<ListFilesResponse>(`/files?${query.toString()}`, {
    method: 'GET',
  })
}

export const useListMyFiles = (params: Parameters<typeof listMyFiles>[0]) => {
  const { isLoggedIn } = useUser()
  return useQuery({
    queryKey: [keys.files, params],
    queryFn: () => listMyFiles(params),
    refetchOnMount: 'always',
    placeholderData: keepPreviousData,
    enabled: isLoggedIn,
  })
}
