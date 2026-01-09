import { proxy } from 'valtio'

type State = {
  isOpen: boolean
}

export const shortcutHelpStore = proxy<State>({
  isOpen: false,
})

export const openShortcutHelp = () => {
  shortcutHelpStore.isOpen = true
}

export const closeShortcutHelp = () => {
  shortcutHelpStore.isOpen = false
}

export const toggleShortcutHelp = () => {
  shortcutHelpStore.isOpen = !shortcutHelpStore.isOpen
}
