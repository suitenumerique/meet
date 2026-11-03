import type {
  WhiteboardStorageAdapter,
  BinaryFileData,
  DataURL,
  FileId,
} from '../types/storage'

const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024 // 25 MB binary limit
const MAX_PAYLOAD_CHARS = Math.ceil((MAX_PAYLOAD_BYTES * 4) / 3) // ~34.9M Base64 chars

export class MeetWhiteboardStorageAdapter implements WhiteboardStorageAdapter {
  private uploadedFiles: Set<string> = new Set()
  private fileCache: Map<string, BinaryFileData> = new Map()
  private maxCacheSize: number

  constructor(maxCacheSize = 100) {
    this.maxCacheSize = maxCacheSize
  }

  public hasFile(fileId: string): boolean {
    return this.uploadedFiles.has(fileId) || this.fileCache.has(fileId)
  }

  private setInCache(fileId: string, data: BinaryFileData): void {
    if (this.fileCache.has(fileId)) {
      this.fileCache.delete(fileId)
    } else if (this.fileCache.size >= this.maxCacheSize) {
      // LRU Eviction: delete oldest entry
      const oldestKey = this.fileCache.keys().next().value
      if (oldestKey !== undefined) {
        this.fileCache.delete(oldestKey)
      }
    }
    this.fileCache.set(fileId, data)
  }

  private getFromCache(fileId: string): BinaryFileData | undefined {
    const cached = this.fileCache.get(fileId)
    if (cached) {
      // Refresh LRU recency
      this.fileCache.delete(fileId)
      this.fileCache.set(fileId, cached)
      return cached
    }
    return undefined
  }

  public async uploadFile(
    roomId: string,
    fileId: string,
    fileData: BinaryFileData
  ): Promise<void> {
    if (this.hasFile(fileId)) return

    // Validate that the MIME type is an image format
    if (!fileData.mimeType?.startsWith('image/')) {
      console.warn(
        `[MeetWhiteboardStorageAdapter] Aborting upload for "${fileId}": invalid MIME type "${fileData.mimeType}".`
      )
      this.uploadedFiles.add(fileId)
      return
    }

    // Guard against oversized payloads
    if (fileData.dataURL && fileData.dataURL.length > MAX_PAYLOAD_CHARS) {
      console.warn(
        `[MeetWhiteboardStorageAdapter] File "${fileId}" exceeds maximum 25MB threshold. Upload aborted.`
      )
      this.uploadedFiles.add(fileId)
      return
    }

    // Optimistically track the file to avoid duplicate concurrent uploads
    this.uploadedFiles.add(fileId)

    try {
      const res = await fetch(fileData.dataURL)
      if (!res.ok) {
        throw new Error(
          `Failed to convert dataURL to blob for file "${fileId}" (HTTP ${res.status})`
        )
      }
      const blob = await res.blob()

      const ext = fileData.mimeType.split('/')[1] || 'png'
      const formData = new FormData()
      formData.append('file_id', fileId)
      formData.append('file', blob, `${fileId}.${ext}`)

      const uploadUrl = `/api/v1.0/rooms/${encodeURIComponent(roomId)}/whiteboard-assets/`
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
        throw new Error(
          `Failed to upload whiteboard asset "${fileId}" (HTTP ${uploadRes.status})`
        )
      }

      this.setInCache(fileId, fileData)
    } catch (err) {
      this.uploadedFiles.delete(fileId)
      this.fileCache.delete(fileId)
      console.error(`Failed to upload file "${fileId}":`, err)
      throw err
    }
  }

  public async getFile(
    roomId: string,
    fileId: string
  ): Promise<BinaryFileData | null> {
    const cached = this.getFromCache(fileId)
    if (cached) {
      return cached
    }

    try {
      const assetUrl = `/api/v1.0/rooms/${encodeURIComponent(roomId)}/whiteboard-assets/${encodeURIComponent(fileId)}/`
      const res = await fetch(assetUrl)

      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error(
          `Failed to download whiteboard asset from ${assetUrl} (HTTP ${res.status})`
        )
      }

      const blob = await res.blob()

      // Convert blob back to base64 DataURL
      const dataURL = await new Promise<DataURL>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result as DataURL)
          } else {
            reject(new Error(`Failed to convert file "${fileId}" to DataURL`))
          }
        }
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })

      const fileData: BinaryFileData = {
        id: fileId as FileId,
        dataURL,
        mimeType: (blob.type || 'image/png') as BinaryFileData['mimeType'],
        created: Date.now(),
      }

      this.setInCache(fileId, fileData)
      return fileData
    } catch (err) {
      console.error(`Failed to fetch whiteboard asset "${fileId}":`, err)
      throw err
    }
  }
}
