import { useState } from "react";
import Breadcrumb from "../components/Breadcrumb";

/**
 * ============================================================================
 * CONTACT DEVELOPER
 * ============================================================================
 * Shown to ADMIN / TEACHER / FINANCE / STUDENT (see App.jsx route guard).
 *
 * Edit CONTACT below with your real details. The "Send a message" form
 * doesn't hit a backend — it just opens the user's email client via a
 * mailto: link, pre-filled with what they typed. If you'd rather have it
 * post to a real support endpoint, swap handleSubmit for an API call.
 * ============================================================================
 */

const CONTACT = {
  developerName: "Steve Ongera",
  company: "Innovations Softwares",
  email: "gadafimran411@gmail.com",
  phone: "0112 284 093 or 0757 790 687  ",
  location: "Nairobi, Kenya",
  hours: "Mon – Fri, 9:00 AM – 6:00 PM (EAT)",
};

const FAQS = [
  {
    q: "Who do I contact if the portal is not loading?",
    a: "Reach out using the form on this page or email support directly. Please include your role (Admin/Teacher/Finance/Student) and a screenshot of the issue if possible — it helps us resolve it faster.",
  },
  {
    q: "I forgot my password — what do I do?",
    a: "Students can reset their own password from the login page's 'Forgot Password' link. Admin, Teacher, and Finance accounts should be reset by a school Admin from Admin → Users, or by contacting the developer directly.",
  },
  {
    q: "Can new features be added to the system?",
    a: "Yes — the system is actively maintained. Send a description of what you need through the contact form or email, and we'll follow up with feasibility and timeline.",
  },
  {
    q: "How do I report a bug?",
    a: "Use the contact form below and describe what you were doing, what you expected, and what happened instead. Screenshots speed up the fix significantly.",
  },
  {
    q: "Is my school's data backed up?",
    a: "Yes, the system runs regular backups. If you ever need a data export or restore, contact the developer directly.",
  },
  {
    q: "How do I request training for new staff?",
    a: "Check the User Manual page first — it covers most day-to-day tasks with short videos. For a live walkthrough with your team, request one through this contact form.",
  },
];

function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="accordion" id="faqAccordion">
      {FAQS.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div className="accordion-item" key={idx}>
            <h2 className="accordion-header">
              <button
                className={`accordion-button ${isOpen ? "" : "collapsed"}`}
                type="button"
                onClick={() => setOpenIndex(isOpen ? -1 : idx)}
                style={{ boxShadow: "none" }}
              >
                {item.q}
              </button>
            </h2>
            {isOpen && (
              <div className="accordion-body">
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ContactDeveloper() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Masomo System — message from ${form.name || "a user"}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\n\nMessage:\n${form.message}`
    );
    window.location.href = `mailto:${CONTACT.email}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Contact Developer", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Contact Developer</h1>
          <p className="page-subtitle">
            Get in touch for support, bug reports, or feature requests.
          </p>
        </div>
      </div>

      <div className="contact-page-grid">
        {/* Left column: contact details + location */}
        <div>
          <div className="card p-4 mb-4">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-person-badge me-2" style={{ color: "var(--blue-700)" }}></i>
              Developer Contact
            </h6>

            <div className="contact-detail-row">
              <i className="bi bi-code-slash"></i>
              <div>
                <span className="contact-detail-label">Developer</span>
                <span className="contact-detail-value">{CONTACT.developerName}</span>
              </div>
            </div>
            <div className="contact-detail-row">
              <i className="bi bi-building"></i>
              <div>
                <span className="contact-detail-label">Company</span>
                <span className="contact-detail-value">{CONTACT.company}</span>
              </div>
            </div>
            <div className="contact-detail-row">
              <i className="bi bi-envelope"></i>
              <div>
                <span className="contact-detail-label">Email</span>
                <a className="contact-detail-value" href={`mailto:${CONTACT.email}`}>
                  {CONTACT.email}
                </a>
              </div>
            </div>
            <div className="contact-detail-row">
              <i className="bi bi-telephone"></i>
              <div>
                <span className="contact-detail-label">Phone</span>
                <a className="contact-detail-value" href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`}>
                  {CONTACT.phone}
                </a>
              </div>
            </div>
            <div className="contact-detail-row">
              <i className="bi bi-geo-alt"></i>
              <div>
                <span className="contact-detail-label">Location</span>
                <span className="contact-detail-value">{CONTACT.location}</span>
              </div>
            </div>
            <div className="contact-detail-row">
              <i className="bi bi-clock"></i>
              <div>
                <span className="contact-detail-label">Support Hours</span>
                <span className="contact-detail-value">{CONTACT.hours}</span>
              </div>
            </div>
          </div>

      
        </div>

        {/* Right column: FAQs */}
        <div>
          <div className="card p-4">
            <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-question-circle me-2" style={{ color: "var(--blue-700)" }}></i>
              Frequently Asked Questions
            </h6>
            <FaqAccordion />
          </div>
        </div>
      </div>
    </div>
  );
}