import { useConfig } from '@/api/useConfig'
import { getCaptionControllers, useRegistryVersion } from '@/features/plugins'
import { NativeCaptionSource } from './nativeCaptionSource'

/**
 * Headless mount point for caption producers: the native source plus every
 * enabled plugin caption controller. Must live inside RoomContext.
 */
export const CaptionSources = () => {
  const { data: config } = useConfig()
  useRegistryVersion() // mount a late bundle's caption controller
  const controllers = getCaptionControllers(config)

  return (
    <>
      <NativeCaptionSource />
      {controllers.map((controller) => {
        const Controller = controller.Controller
        return <Controller key={controller.pluginId} />
      })}
    </>
  )
}
