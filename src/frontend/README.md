# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default {
  // other rules...
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
}
```

- Replace `plugin:@typescript-eslint/recommended` to `plugin:@typescript-eslint/recommended-type-checked` or `plugin:@typescript-eslint/strict-type-checked`
- Optionally add `plugin:@typescript-eslint/stylistic-type-checked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and add `plugin:react/recommended` & `plugin:react/jsx-runtime` to the `extends` list

## Side Panel Focus Pattern

We use a consistent focus management pattern for side panels:

- **Open**: focus the first actionable element inside the panel.
- **Close**: restore focus to the button that opened the panel.

Implementation summary:

1. A provider stores a `panelRef` and a registry of trigger refs (`setTrigger/getTrigger`).
2. Each trigger button registers itself with `setTrigger("key", el)`.
3. Panel content uses `useRestoreFocus` with:
   - `resolveTrigger` → returns `getTrigger("key")`.
   - `onOpened` → finds the first actionable element inside `panelRef`.

Example:

```tsx
// Trigger button
;<ToggleButton ref={(el) => setTrigger('tools', el)} />

// Panel content
useRestoreFocus(isOpen, {
  resolveTrigger: (activeEl) => getTrigger('tools') ?? activeEl,
  onOpened: () => {
    const first = panelRef.current?.querySelector(
      '[data-attr="tools-list"] button'
    )
    ;(first as HTMLElement | null)?.focus({ preventScroll: true })
  },
})
```
