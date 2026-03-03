import { fetchApi } from '@/api/fetchApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiFileItem } from '@/features/files/api/types.ts'
import { keys } from '@/api/queryKeys.ts'

/**
 * Upload a file, using XHR so we can report on progress through a handler.
 *
 * @param url The URL to PUT the file to.
 * @param file The file to upload.
 * @param progressHandler A handler that receives progress updates as a single integer `0 <= x <= 100`.
 */
export const uploadFile = (
  url: string,
  file: File,
  progressHandler: (progress: number) => void
) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('X-amz-acl', 'private')
    xhr.setRequestHeader('Content-Type', file.type)

    xhr.addEventListener('error', reject)
    xhr.addEventListener('abort', reject)

    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          // Make sure to always set the progress to 100% when the upload is done.
          // Because 'progress' event listener is not called when the file size is 0.
          progressHandler(100)
          return resolve(true)
        }
        reject(new Error(`Failed to perform the upload on ${url}.`))
      }
    })

    xhr.upload.addEventListener('progress', (progressEvent) => {
      if (progressEvent.lengthComputable) {
        progressHandler(
          Math.floor((progressEvent.loaded / progressEvent.total) * 100)
        )
      }
    })

    xhr.send(file)
  })

/**
 * Asynchronously creates a new file and uploads it to the server.
 *
 * @param {object} params - The parameters for the file creation and upload process.
 * @param {File} params.file - The file object to be uploaded.
 * @param {function} params.onProgress - A callback function that receives the upload progress as a number (0 to 100).
 * @returns {Promise<ApiFileItem>} A promise that resolves when the file has been successfully uploaded and the server process is completed.
 */
export const createFile = async ({
  file,
  onProgress,
}: {
  file: File
  onProgress: (progress: number) => void
}): Promise<ApiFileItem> => {
  const res = await fetchApi<ApiFileItem>(`/files/`, {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, type: 'background_image' }),
  })
  if (res.upload_state !== 'pending') {
    throw new Error('State should be pending right after creation')
  }
  const policy = res.policy
  await uploadFile(policy, file, onProgress)
  return await fetchApi<ApiFileItem>(`/files/${res.id}/upload-ended/`, {
    method: 'POST',
  })
}

export const useCreateFile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createFile,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [keys.files],
      })
    },
  })
}
