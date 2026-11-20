/** The mark is drawn once, in public/favicon.svg; the header shows that same file. */
export function BrandMark({ className = 'size-6' }: { readonly className?: string }) {
  return <img src="/favicon.svg" alt="" className={className} draggable={false} />;
}
