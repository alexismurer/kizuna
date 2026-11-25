// The pulsing logo shown while a page's content loads; for Suspense fallbacks on pages whose
// <main> also holds a title (an empty <main> already shows it through globals.css).
export function PageLoader() {
  return (
    <div role="status" aria-busy className="page-loader m-auto flex items-center justify-center py-16">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/kizuna-mark-white.png" alt="" aria-hidden width={64} height={64} className="h-16 w-16" />
    </div>
  );
}
