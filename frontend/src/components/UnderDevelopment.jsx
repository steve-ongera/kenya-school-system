// src/components/UnderDevelopment.jsx
export default function UnderDevelopment({ title, message = "This page is being built and will be available soon." }) {
  return (
    <div>
      {title && <h2 className="page-title">{title}</h2>}
      <div className="card p-5 text-center">
        <i className="bi bi-cone-striped fs-1 text-muted mb-3"></i>
        <h5 className="mb-1">Under Development</h5>
        <p className="text-muted mb-0">{message}</p>
      </div>
    </div>
  );
}