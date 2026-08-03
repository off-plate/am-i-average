/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the resolver endpoint, e.g. for local netlify dev. */
  readonly VITE_RESOLVER?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
