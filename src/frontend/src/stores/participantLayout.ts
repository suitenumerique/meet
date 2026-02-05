import { proxy } from 'valtio'

type LayoutType = 'grid' | 'carousel' | null

type State = {
  layoutType: LayoutType
  firstGridTileTrackId: string | null
}

export const participantLayoutStore = proxy<State>({
  layoutType: null,
  firstGridTileTrackId: null,
})

export const setGridLayout = (firstTrackId: string | null) => {
  participantLayoutStore.layoutType = 'grid'
  participantLayoutStore.firstGridTileTrackId = firstTrackId
}

export const setCarouselLayout = () => {
  participantLayoutStore.layoutType = 'carousel'
  participantLayoutStore.firstGridTileTrackId = null
}

export const resetLayout = () => {
  participantLayoutStore.layoutType = null
  participantLayoutStore.firstGridTileTrackId = null
}

