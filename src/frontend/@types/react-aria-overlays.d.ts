import type * as React from 'react';

declare module '@react-aria/overlays' {
  export type PortalProviderContextValue = {
    getContainer: () => HTMLElement | null;
  };

  export type PortalProviderProps = {
    getContainer: () => HTMLElement | null;
    children: React.ReactNode;
  };

  export function useUNSAFE_PortalContext(): PortalProviderContextValue;
  export function UNSAFE_PortalProvider(
    props: PortalProviderProps,
  ): JSX.Element;
}

