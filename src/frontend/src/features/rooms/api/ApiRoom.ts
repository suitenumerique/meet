export type ApiLiveKit = {
  url: string
  room: string
  token: string
}

export type ApiRoom = {
  id: string
  name: string
  slug: string
  is_administrable: boolean
  access_level: string
  livekit?: ApiLiveKit
  configuration?: {
    [key: string]: string | number | boolean
  }
}
