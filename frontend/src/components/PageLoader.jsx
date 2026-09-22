// src/components/PageLoader.jsx
//
// Circular loader used everywhere a page/component is still loading.
//   <PageLoader />         -> covers the whole screen (first visit, login, auth check)
//   <PageLoader inline />  -> fills just the content area, so the sidebar and
//                             navbar stay visible while a page chunk loads
export default function PageLoader({ inline = false, label = "Loading..." }) {
  return (
    <div
      className={`page-loader ${inline ? "page-loader--inline" : "page-loader--full"}`}
      role="status"
      aria-live="polite"
    >
      <div className="page-loader__ring" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}