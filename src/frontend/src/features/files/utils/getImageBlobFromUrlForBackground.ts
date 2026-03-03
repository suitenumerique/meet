/**
 * Processes the provided image blob to generate a 16:9 aspect ratio cropped version
 * resized to a maximum width of 1920 pixels, suitable for background usage.
 *
 * @param {Blob} imageDataBlob - The source image blob to be processed.
 * @return {Promise<Blob>} A promise that resolves to a blob containing the processed image.
 */
export async function getImageBlobForBackground(
  imageDataBlob: Blob
): Promise<Blob> {
  const image = new Image()

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  return new Promise((resolve, reject) => {
    image.onload = async () => {
      const targetRatio = 16 / 9

      const imgWidth = image.width
      const imgHeight = image.height
      const imgRatio = imgWidth / imgHeight

      let cropWidth, cropHeight, cropX, cropY

      // ---- 1️⃣ Compute centered 16:9 crop ----
      if (imgRatio > targetRatio) {
        // Image too wide → crop sides
        cropHeight = imgHeight
        cropWidth = imgHeight * targetRatio
        cropX = (imgWidth - cropWidth) / 2
        cropY = 0
      } else {
        // Image too tall → crop top/bottom
        cropWidth = imgWidth
        cropHeight = imgWidth / targetRatio
        cropX = 0
        cropY = (imgHeight - cropHeight) / 2
      }

      // ---- 2️⃣ Limit width to max 1920 ----
      const outputWidth = Math.min(1920, cropWidth)
      const outputHeight = outputWidth / targetRatio

      canvas.width = outputWidth
      canvas.height = outputHeight

      const ctx = context

      if (!ctx) {
        return reject(new Error('Could not get canvas context'))
      }

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight
      )

      canvas.toBlob(
        (data) => {
          if (!data)
            return reject(new Error('Could not convert canvas to blob'))
          resolve(data)
        },
        'image/jpeg',
        0.95
      )
    }

    image.src = URL.createObjectURL(imageDataBlob)
  })
}

/**
 * Fetches an image from a given URL, processes it to generate a centered 16:9 crop,
 * scales it down to a maximum width of 1920 pixels, and returns the processed image as a blob.
 *
 * @param {string} url - The URL of the image to fetch and process.
 * @return {Promise<Blob>} A Promise that resolves to the processed image as a JPEG format blob.
 */
export async function getImageBlobFromUrlForBackground(
  url: string
): Promise<Blob> {
  // We need to use the fetch API to get the image as a blob, to have proper CORS handling.
  // as the image data is used inside a canvas and we then need to export that canvas.
  const imageRequest = await fetch(url, {
    credentials: 'include',
  })
  const rawImageData = await imageRequest.blob()
  return getImageBlobForBackground(rawImageData)
}
