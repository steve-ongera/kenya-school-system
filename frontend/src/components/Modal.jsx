// src/components/Modal.jsx
export default function Modal({ 
  show, 
  onClose, 
  title, 
  children, 
  size, 
  footer,
  closeOnBackdrop = true,
  fullscreen = false
}) {
  if (!show) return null;

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      <div 
        className="modal-backdrop fade show" 
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(11, 37, 69, 0.55)",
          zIndex: 1040,
          backdropFilter: "blur(2px)",
        }}
      ></div>
      <div
        className="modal fade show"
        style={{
          display: "block",
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          zIndex: 1050,
        }}
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        onClick={handleBackdropClick}
      >
        <div
          className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size ? `modal-${size}` : ""} ${fullscreen ? "modal-fullscreen" : ""}`}
          role="document"
          style={{
            display: "flex",
            alignItems: "center",
            minHeight: "calc(100% - 1rem)",
            margin: "0.5rem auto",
            maxWidth: size === "sm" ? "400px" : size === "lg" ? "800px" : size === "xl" ? "1000px" : "560px",
            width: "100%",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            className="modal-content"
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              width: "100%",
              pointerEvents: "auto",
              backgroundColor: "#ffffff",
              backgroundClip: "padding-box",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 20px 60px rgba(11, 37, 69, 0.15)",
              outline: 0,
              maxHeight: "calc(100vh - 1rem)",
            }}
          >
            {/* Modal Header */}
            <div 
              className="modal-header"
              style={{
                display: "flex",
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1rem 1.5rem",
                borderBottom: "1px solid var(--border-color)",
                borderTopLeftRadius: "var(--radius-lg)",
                borderTopRightRadius: "var(--radius-lg)",
                backgroundColor: "var(--bg-app)",
              }}
            >
              <h5 
                className="modal-title"
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "var(--fs-md)",
                  color: "var(--ink-900)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {title}
              </h5>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
                aria-label="Close"
                style={{
                  padding: "0.5rem",
                  margin: "-0.5rem -0.5rem -0.5rem auto",
                  backgroundColor: "transparent",
                  border: 0,
                  borderRadius: "var(--radius-sm)",
                  opacity: 0.5,
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  lineHeight: 1,
                  color: "var(--ink-600)",
                  transition: "opacity 0.15s ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div 
              className="modal-body"
              style={{
                position: "relative",
                flex: "1 1 auto",
                padding: "1.5rem",
                overflowY: "auto",
                color: "var(--ink-700)",
                fontSize: "var(--fs-base)",
                lineHeight: 1.6,
              }}
            >
              {children}
            </div>

            {/* Modal Footer (optional) */}
            {footer && (
              <div 
                className="modal-footer"
                style={{
                  display: "flex",
                  flexShrink: 0,
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  padding: "0.75rem 1.5rem",
                  borderTop: "1px solid var(--border-color)",
                  borderBottomLeftRadius: "var(--radius-lg)",
                  borderBottomRightRadius: "var(--radius-lg)",
                  backgroundColor: "var(--bg-app)",
                  gap: "0.5rem",
                }}
              >
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}