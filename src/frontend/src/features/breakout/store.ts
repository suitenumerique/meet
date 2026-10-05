import { proxy } from 'valtio'
import { MIN_ROOMS, type Assignments } from './utils/setup'

const initialSetup = () => ({
  roomCount: MIN_ROOMS,
  assignments: {} as Assignments,
})

// The host's plan before Open, kept while the panel is closed.
export const breakoutSetupStore = proxy(initialSetup())

export const resetBreakoutSetup = () => {
  Object.assign(breakoutSetupStore, initialSetup())
}
