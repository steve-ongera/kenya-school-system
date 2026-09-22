import { Fragment, useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { financeApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import logoImage from "../../assets/junda_high_logo.png";

const SCHOOL_NAME = "Junda High School";
const DOC_COPY_NOTE = "This is a computer-generated document copy.";

const money = (v) => Number(v || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "-";
const safeName = (s) => String(s).trim().replace(/[^\w-]+/g, "_");

// Load an image URL as a base64 data URL (for embedding the logo in PDFs)
const getImageBase64 = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
  });

// ---------------------------------------------------------------------------
// Build the PDF for one academic year: `entries` is the list of terms (each
// with a structure) to include - one term for a single-term download, every
// term for "download full year".
// ---------------------------------------------------------------------------
async function buildFeeStructurePdf(student, block, entries) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const M = 12;
  const single = entries.length === 1;

  const logo = await getImageBase64(logoImage);
  const generatedOn = new Date().toLocaleDateString("en-KE", {
    year: "numeric", month: "long", day: "numeric",
  });

  // --- Header ---
  if (logo) doc.addImage(logo, "PNG", M, 8, 12, 12);
  const textX = logo ? M + 16 : M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(SCHOOL_NAME, textX, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Fee Structure", textX, 19);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${generatedOn}`, pageWidth - M, 14, { align: "right" });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(M, 23, pageWidth - M, 23);

  const gridStyles = { lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [51, 65, 85] };
  const labelCell = { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [71, 85, 105] };

  // --- Student / class block ---
  autoTable(doc, {
    startY: 26,
    theme: "grid",
    body: [
      ["Student", student?.name || "-", "Admission No", student?.admission_no || "-"],
      ["Class", block.classroom || block.grade_level, "Curriculum", block.curriculum || "-"],
      ["Academic Year", String(block.academic_year), "Term", single ? `Term ${entries[0].term_number}` : "All terms"],
    ],
    styles: { fontSize: 8.5, cellPadding: 1.8, ...gridStyles },
    columnStyles: {
      0: { cellWidth: 30, ...labelCell },
      1: { cellWidth: 58 },
      2: { cellWidth: 30, ...labelCell },
      3: { cellWidth: "auto" },
    },
    margin: { left: M, right: M },
  });
  let y = doc.lastAutoTable.finalY + 8;

  // --- One fee table per term ---
  let yearTotal = 0;
  entries.forEach((t) => {
    const fs = t.structure;
    yearTotal += Number(fs.total_amount);

    if (y > pageHeight - 70) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Term ${t.term_number}, ${block.academic_year}`, M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${fmtDate(t.start_date)} to ${fmtDate(t.end_date)}`, pageWidth - M, y, { align: "right" });

    const hasItems = fs.items && fs.items.length > 0;
    autoTable(doc, {
      startY: y + 2,
      theme: "grid",
      head: [["Fee item", "Amount (KES)"]],
      body: hasItems
        ? fs.items.map((i) => [i.name, money(i.amount)])
        : [["School fees for the term", money(fs.total_amount)]],
      foot: [["Total", money(fs.total_amount)]],
      showFoot: "lastPage",
      styles: { fontSize: 9, cellPadding: 2, ...gridStyles },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 45, halign: "right" },
      },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 9;
  });

  // --- Year total when more than one term is included ---
  if (!single) {
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }
    autoTable(doc, {
      startY: y,
      theme: "grid",
      body: [[`Total for ${block.academic_year} (${entries.length} terms)`, `KES ${money(yearTotal)}`]],
      styles: {
        fontSize: 10, cellPadding: 2.4, fontStyle: "bold",
        fillColor: [241, 245, 249], ...gridStyles, textColor: [15, 23, 42],
      },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 60, halign: "right" } },
      margin: { left: M, right: M },
    });
  }

  // --- Footer on every page ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M, pageHeight - 14, pageWidth - M, pageHeight - 14);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(DOC_COPY_NOTE, pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`${SCHOOL_NAME} — Document Copy`, M, pageHeight - 5.5);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - M, pageHeight - 5.5, { align: "right" });
  }

  return doc;
}

export default function StudentFeeStructure() {
  const [student, setStudent] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null); // `${enrollment_id}:${term_id}`
  const [downloading, setDownloading] = useState(""); // key of the PDF being built

  useEffect(() => {
    financeApi
      .myStructures()
      .then(({ data }) => {
        setStudent(data.student);
        setBlocks(data.enrollments || []);
      })
      .catch((err) => {
        console.error("Failed to load fee structures:", err);
        setError(err.response?.data?.detail || "Could not load your fee structures. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  const download = async (key, block, entries, filename) => {
    try {
      setDownloading(key);
      const doc = await buildFeeStructurePdf(student, block, entries);
      doc.save(filename);
    } catch (err) {
      console.error("Failed to generate fee structure PDF:", err);
    } finally {
      setDownloading("");
    }
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/student" },
        { label: "Fees", href: "/student/fees" },
        { label: "Fee Structure", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Fee Structure</h1>
          <p className="page-subtitle">
            Download the fee structure for your class, term by term.
          </p>
        </div>
        <a href="/student/fees" className="btn btn-sm btn-outline-secondary">
          <i className="bi bi-receipt me-1"></i>
          My Fee Statements
        </a>
      </div>

      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : error ? (
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </div>
      ) : blocks.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <i className="bi bi-cash-stack"></i>
            <h6>No Fee Structures</h6>
            <p className="text-muted-soft">
              We couldn't find any enrollment for your account yet. Please contact the finance office.
            </p>
          </div>
        </div>
      ) : (
        blocks.map((block) => {
          const withStructure = block.terms.filter((t) => t.structure);
          const yearKey = `year:${block.enrollment_id}`;
          return (
            <div className="table-wrap mb-4" key={block.enrollment_id}>
              <div className="table-wrap__header">
                <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  <i className="bi bi-mortarboard me-2"></i>
                  {block.grade_level} — {block.academic_year}
                  <span className="badge badge-blue ms-2">{block.classroom}</span>
                  {block.status !== "ACTIVE" && (
                    <span className="badge badge-neutral ms-2">{block.status_display}</span>
                  )}
                </span>
                {withStructure.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={downloading === yearKey}
                    onClick={() =>
                      download(
                        yearKey, block, withStructure,
                        `Fee_Structure_${safeName(block.grade_level)}_${block.academic_year}_All_Terms.pdf`
                      )
                    }
                  >
                    {downloading === yearKey ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                        Preparing...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-file-earmark-pdf me-1"></i>
                        Download full year
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Term</th>
                      <th>Period</th>
                      <th className="text-end">Total Fees (KES)</th>
                      <th style={{ width: "220px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.terms.map((t) => {
                      const key = `${block.enrollment_id}:${t.term_id}`;
                      const isOpen = expanded === key;
                      return (
                        <Fragment key={key}>
                          <tr>
                            <td>
                              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                                {block.grade_level} — Term {t.term_number}, {block.academic_year}
                              </span>
                            </td>
                            <td style={{ color: "var(--ink-600)", fontSize: "var(--fs-sm)" }}>
                              {fmtDate(t.start_date)} - {fmtDate(t.end_date)}
                            </td>
                            <td className="text-end fw-bold">
                              {t.structure ? money(t.structure.total_amount) : <span className="text-muted-soft">-</span>}
                            </td>
                            <td className="text-end">
                              {t.structure ? (
                                <div className="d-flex gap-2 justify-content-end">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => setExpanded(isOpen ? null : key)}
                                  >
                                    <i className={`bi ${isOpen ? "bi-chevron-up" : "bi-list-ul"} me-1`}></i>
                                    {isOpen ? "Hide" : "View"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    disabled={downloading === key}
                                    onClick={() =>
                                      download(
                                        key, block, [t],
                                        `Fee_Structure_${safeName(block.grade_level)}_Term_${t.term_number}_${block.academic_year}.pdf`
                                      )
                                    }
                                  >
                                    {downloading === key ? (
                                      <>
                                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                        Preparing...
                                      </>
                                    ) : (
                                      <>
                                        <i className="bi bi-download me-1"></i>
                                        PDF
                                      </>
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="badge badge-neutral">Not set up yet</span>
                              )}
                            </td>
                          </tr>

                          {isOpen && t.structure && (
                            <tr>
                              <td colSpan={4} style={{ background: "var(--surface-50, #f8fafc)" }}>
                                {t.structure.items.length === 0 ? (
                                  <span className="text-muted-soft">
                                    No item breakdown has been added for this term. Total fees: KES {money(t.structure.total_amount)}.
                                  </span>
                                ) : (
                                  <table className="table table-sm mb-0" style={{ maxWidth: "460px" }}>
                                    <tbody>
                                      {t.structure.items.map((item, idx) => (
                                        <tr key={idx}>
                                          <td>{item.name}</td>
                                          <td className="text-end">{money(item.amount)}</td>
                                        </tr>
                                      ))}
                                      <tr style={{ fontWeight: 700 }}>
                                        <td>Total</td>
                                        <td className="text-end">{money(t.structure.total_amount)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}