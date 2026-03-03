import { fetchApi } from '@/api/fetchApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys.ts'

/**
 * Deletes a file specified by its unique identifier.
 *
 * @param {Object} params - The parameters required for deleting the file.
 * @param {string} params.fileId - The unique identifier of the file to be deleted.
 * @returns {Promise<void>} A promise that resolves when the file is successfully deleted.
 */
export const deleteFile = async ({
  fileId,
}: {
  fileId: string
}): Promise<void> => {
  await fetchApi<void>(
    `/files/${fileId}/`,
    {
      method: 'DELETE',
    },
    // Override default json transform to avoid errors
    async () => {}
  )
}

export const useDeleteFile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteFile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [keys.files],
      })
    },
  })
}
