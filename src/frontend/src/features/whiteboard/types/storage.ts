import type {
  BinaryFileData,
  BinaryFiles,
  DataURL,
} from '@excalidraw/excalidraw/types'
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types'

export type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawElement,
  FileId,
  DataURL,
  OrderedExcalidrawElement,
}

export interface WhiteboardStorageAdapter {
  uploadFile(
    roomId: string,
    fileId: string,
    fileData: BinaryFileData
  ): Promise<void>
  getFile(roomId: string, fileId: string): Promise<BinaryFileData | null>
  hasFile(fileId: string): boolean
}
