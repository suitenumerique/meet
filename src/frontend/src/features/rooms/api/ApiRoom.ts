export type ApiRoom = {
  id: string
  name: string
  slug: string
  is_administrable: boolean
  access_level: string
  livekit?: {
    url: string
    room: string
    token: string
  }
  configuration?: {
    [key: string]: string | number | boolean
  }
}
