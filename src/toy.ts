/** Each toy exports one of these from toys/<slug>/meta.ts; the home page lists them. */
export interface ToyMeta {
  title: string;
  blurb: string;
  /** ISO date the toy shipped. */
  shipped: string;
}
