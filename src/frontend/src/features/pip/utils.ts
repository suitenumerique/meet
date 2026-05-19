export const IS_PIP_SUPPORTED =
  typeof globalThis !== 'undefined' && 'documentPictureInPicture' in globalThis
