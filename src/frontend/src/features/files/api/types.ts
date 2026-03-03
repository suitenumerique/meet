export type ApiFileCreator = {
  id: string // UUID
  full_name: string | null
  short_name: string | null
}

export type ApiFileType = 'background_image'
export type ApiFileUploadState = 'pending' | 'ready'

export type ApiFileItem = {
  id: string // UUID
  created_at: string // ISO datetime string
  updated_at: string // ISO datetime string
  title: string
  type: ApiFileType
  creator: ApiFileCreator
  deleted_at: string | null
  hard_deleted_at: string | null
  filename: string
  upload_state: ApiFileUploadState
  mimetype: string // e.g. "image/png"
  size: number // file size in bytes
  description: string | null
} & (
  | {
      upload_state: 'ready'
      url: string
    }
  | {
      upload_state: 'pending'
      policy: string
      url: null
    }
)
