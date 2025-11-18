// Minimal shims to satisfy local tooling without installed type packages.
// Consumers should rely on real @types/react in their projects.

declare module 'react' {
  export type CSSProperties = Record<string, any>;
  export type FC<P = {}> = (props: P & { children?: any }) => any;
  export function useState<S = any>(initial?: any): any;
  export function useEffect(effect: (...args: any[]) => any, deps?: any[]): void;
  export function useMemo<T = any>(factory: () => T, deps?: any[]): T;
  export function useRef<T = any>(initial?: T): { current: T | null };
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: any[]): T;
  const React: any;
  export default React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'papaparse';
declare module 'xlsx';

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}