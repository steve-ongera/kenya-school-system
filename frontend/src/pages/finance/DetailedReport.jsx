import { useEffect, useRef, useState } from "react";
import { financeReportsApi, calendarApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImage from "../../assets/masomo_logo.png";

const formatKES = (n) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const STATUS_BADGE = {
  paid: { className: "badge-success", label: "Paid", icon: "bi-check-circle" },
  partial: { className: "badge-warning", label: "Partial", icon: "bi-hourglass-split" },
  unpaid: { className: "badge-danger", label: "Unpaid", icon: "bi-x-circle" },
};

export default function FinanceDetailedReport() {
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);

  const [terms, setTerms] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [termFilter, setTermFilter] = useState("");
  const [classroomFilter, setClassroomFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [activeTab, setActiveTab] = useState("invoices");

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const initialLoad = useRef(true);
  const searchDebounce = useRef(null);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(searchDebounce.current);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    financeReportsApi
      .detailed()
      .then(({ data: res }) => {
        setResult(res);
        setAcademicYears(res.academic_years);
        setSelectedYear(res.selected_academic_year);
      })
      .catch(() => setError("Could not load the detailed report."))
      .finally(() => {
        setLoading(false);
        initialLoad.current = false;
      });
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    calendarApi.terms({ academic_year: selectedYear }).then(({ data }) => setTerms(data.results || data));
    academicsApi
      .classrooms({ academic_year: selectedYear, page_size: 200 })
      .then(({ data }) => setClassrooms(data.results || data));
  }, [selectedYear]);

  useEffect(() => {
    if (initialLoad.current) return;
    setLoading(true);
    setError(null);
    financeReportsApi
      .detailed({
        academic_year: selectedYear || undefined,
        term: termFilter || undefined,
        classroom: classroomFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        page_size: itemsPerPage,
      })
      .then(({ data: res }) => setResult(res))
      .catch(() => setError("Could not load the detailed report."))
      .finally(() => setLoading(false));
  }, [selectedYear, termFilter, classroomFilter, statusFilter, search, page, itemsPerPage]);

  const handleTabClick = (yearId) => {
    if (yearId === selectedYear) return;
    setSelectedYear(yearId);
    setTermFilter("");
    setClassroomFilter("");
    setPage(1);
  };

  const rows = result?.results || [];
  const count = result?.count ?? 0;
  const pageSize = itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setTermFilter("");
    setClassroomFilter("");
    setStatusFilter("");
    setPage(1);
  };

  const hasActiveFilters = searchInput || termFilter || classroomFilter || statusFilter;

  // Excel-styled PDF Download implementation with grid layout and signature/stamp section
  const handleDownloadPDF = async () => {
    try {
      setDownloadingPdf(true);
      const { data: fullRes } = await financeReportsApi.detailed({
        academic_year: selectedYear || undefined,
        term: termFilter || undefined,
        classroom: classroomFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
        page: 1,
        page_size: 10000,
      });

      const allRows = fullRes?.results || [];
      const totalCount = fullRes?.count ?? allRows.length;

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      const getImageBase64 = (url) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = url;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror = () => resolve(null);
        });
      };

      const base64Logo = await getImageBase64(logoImage);

      if (base64Logo) {
        doc.addImage(base64Logo, "PNG", 10, 6, 8, 8);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("MASOMO SCHOOL - DETAILED FINANCE REPORT (EXCEL EXPORT)", base64Logo ? 20 : 10, 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);

      const currentYearObj = academicYears.find((ay) => ay.id === selectedYear);
      const yearLabel = currentYearObj ? currentYearObj.year : "All Years";
      const termObj = terms.find((t) => String(t.id) === String(termFilter));
      const termLabel = termObj ? (termObj.term_number ? `Term ${termObj.term_number}` : `Term ${termObj.id}`) : "All Terms";
      const classObj = classrooms.find((c) => String(c.id) === String(classroomFilter));
      const classLabel = classObj ? `${classObj.grade_level_name} ${classObj.stream_name || ""}` : "All Classes";
      const statusLabel = statusFilter ? statusFilter.toUpperCase() : "ALL STATUSES";

      doc.text(`Year: ${yearLabel} | Class: ${classLabel} | Term: ${termLabel} | Status: ${statusLabel} | Records: ${totalCount}`, base64Logo ? 20 : 10, 15);

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(10, 17, pageWidth - 10, 17);

      const tableColumn = ["Adm No", "Student Name", "Class", "Term", "Due", "Paid", "Balance", "Status"];
      const tableRows = allRows.map((inv) => {
        const badgeInfo = STATUS_BADGE[inv.status]?.label || inv.status;
        return [
          inv.admission_no,
          inv.student_name,
          inv.classroom,
          inv.term,
          Number(inv.due || 0).toLocaleString(),
          Number(inv.paid || 0).toLocaleString(),
          Number(inv.balance || 0).toLocaleString(),
          badgeInfo,
        ];
      });

      autoTable(doc, {
        startY: 19,
        head: [tableColumn],
        body: tableRows,
        theme: "grid",
        headStyles: { 
          fillColor: [241, 245, 249], 
          textColor: [15, 23, 42], 
          fontStyle: "bold", 
          fontSize: 6,
          cellPadding: 1,
          lineWidth: 0.1,
          lineColor: [203, 213, 225]
        },
        bodyStyles: { 
          fontSize: 5.5, 
          textColor: [51, 65, 85],
          cellPadding: 0.8,
          valign: "middle",
          lineWidth: 0.1,
          lineColor: [226, 232, 240]
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 50 },
          2: { cellWidth: 30 },
          3: { cellWidth: 14 },
          4: { cellWidth: 22, halign: "right" },
          5: { cellWidth: 22, halign: "right" },
          6: { cellWidth: 22, halign: "right" },
          7: { cellWidth: 18, halign: "center" }
        },
        margin: { left: 10, right: 10 },
        didDrawPage: () => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} - Masomo School System Spreadsheet Export`,
            10,
            doc.internal.pageSize.getHeight() - 4
          );
        }
      });

      // Signature and Stamp Block Section
      let finalY = doc.lastAutoTable.finalY + 8;
      const pageHeight = doc.internal.pageSize.getHeight();

      if (finalY > pageHeight - 25) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);

      // Principal Signature
      doc.text("Principal's Signature:", 10, finalY);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.line(10, finalY + 8, 70, finalY + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text("Sign & Official Stamp", 10, finalY + 11);

      // Finance Officer Signature
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("Finance Officer's Signature:", pageWidth - 70, finalY);
      doc.line(pageWidth - 70, finalY + 8, pageWidth - 10, finalY + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text("Sign & Official Stamp", pageWidth - 70, finalY + 11);

      doc.save(`Masomo_Finance_Sheet_${yearLabel}.pdf`);
    } catch (err) {
      setError("Could not generate Excel-styled PDF document.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/finance" },
        { label: "Reports", href: "/finance/reports" },
        { label: "Detailed Report", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Detailed Report</h1>
          <p className="page-subtitle">
            Every invoice, filterable by term, class, and payment status.
          </p>
        </div>
        {academicYears.length > 0 && (
          <ul className="nav nav-pills" style={{ marginBottom: 0 }}>
            {academicYears.map((ay) => (
              <li className="nav-item" key={ay.id}>
                <button
                  type="button"
                  className={`nav-link ${selectedYear === ay.id ? "active" : ""}`}
                  onClick={() => handleTabClick(ay.id)}
                  style={{
                    cursor: "pointer",
                    border: "none",
                    background: "transparent",
                    padding: "0.3rem 0.7rem",
                    fontSize: "var(--fs-sm)",
                    fontWeight: 500,
                    borderRadius: "var(--radius-pill)",
                    transition: "all 0.15s ease",
                    color: selectedYear === ay.id ? "#fff" : "var(--ink-600)",
                    backgroundColor: selectedYear === ay.id ? "var(--blue-700)" : "transparent",
                  }}
                >
                  {ay.year}
                  {ay.is_current && <span className="ms-1" style={{ color: "var(--gold-500)" }}>•</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", paddingBottom: "0.75rem" }}>
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-receipt me-2" style={{ color: "var(--blue-700)" }}></i>
              Detailed Report
            </span>
            <div className="d-flex align-items-center gap-2">
              {activeTab === "invoices" && count > 0 && !loading && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                  onClick={handleDownloadPDF}
                  disabled={downloadingPdf}
                  style={{ fontSize: "var(--fs-xs)" }}
                >
                  {downloadingPdf ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      Generating Excel PDF...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-file-earmark-spreadsheet"></i> Download Excel PDF
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "invoices"}
                className={`nav-link ${activeTab === "invoices" ? "active" : ""}`}
                onClick={() => setActiveTab("invoices")}
              >
                <i className="bi bi-receipt me-1"></i>
                Invoices
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "terms"}
                className={`nav-link ${activeTab === "terms" ? "active" : ""}`}
                onClick={() => setActiveTab("terms")}
              >
                <i className="bi bi-calendar3 me-1"></i>
                Term Summary
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "debtors"}
                className={`nav-link ${activeTab === "debtors" ? "active" : ""}`}
                onClick={() => setActiveTab("debtors")}
              >
                <i className="bi bi-trophy me-1" style={{ color: "var(--gold-500)" }}></i>
                Top Debtors
              </button>
            </li>
          </ul>
        </div>

        {activeTab === "invoices" && (
          <>
            <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
              <div className="d-flex flex-wrap gap-2" style={{ width: "100%" }}>
                <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
                  <i
                    className="bi bi-search"
                    style={{
                      position: "absolute",
                      left: "0.85rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--ink-400)",
                    }}
                  ></i>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search name or admission no…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    style={{ paddingLeft: "2.4rem" }}
                  />
                </div>

                <select
                  className="form-select"
                  value={termFilter}
                  onChange={(e) => {
                    setTermFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ width: "auto", minWidth: "130px" }}
                >
                  <option value="">All terms</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.term_number ? `Term ${t.term_number}` : `Term ${t.id}`}
                    </option>
                  ))}
                </select>

                <select
                  className="form-select"
                  value={classroomFilter}
                  onChange={(e) => {
                    setClassroomFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ width: "auto", minWidth: "140px" }}
                >
                  <option value="">All classes</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.grade_level_name} {c.stream_name}
                    </option>
                  ))}
                </select>

                <select
                  className="form-select"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ width: "auto", minWidth: "130px" }}
                >
                  <option value="">All statuses</option>
                  <option value="paid">Fully paid</option>
                  <option value="partial">Partial</option>
                  <option value="unpaid">Unpaid</option>
                </select>

                {hasActiveFilters && (
                  <button className="btn btn-sm btn-light" onClick={clearFilters}>
                    <i className="bi bi-x-lg"></i> Clear
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <TableSkeleton rows={5} columns={8} />
            ) : rows.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-inbox"></i>
                <h6>No invoices found</h6>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Admission No</th>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Term</th>
                      <th className="text-end">Due</th>
                      <th className="text-end">Paid</th>
                      <th className="text-end">Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((inv) => {
                      const badge = STATUS_BADGE[inv.status] || STATUS_BADGE.unpaid;
                      return (
                        <tr key={inv.id}>
                          <td>{inv.admission_no}</td>
                          <td>{inv.student_name}</td>
                          <td>{inv.classroom}</td>
                          <td>{inv.term}</td>
                          <td className="text-end">{formatKES(inv.due)}</td>
                          <td className="text-end">{formatKES(inv.paid)}</td>
                          <td className="text-end">{formatKES(inv.balance)}</td>
                          <td>
                            <span className={`badge ${badge.className}`}>{badge.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && rows.length > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                itemsPerPage={itemsPerPage}
                setItemsPerPage={setItemsPerPage}
                startIndex={(page - 1) * pageSize}
                endIndex={Math.min(page * pageSize, count)}
                totalItems={count}
              />
            )}
          </>
        )}

        {activeTab === "terms" && !loading && (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Term</th>
                  <th className="text-end">Due</th>
                  <th className="text-end">Paid</th>
                  <th className="text-end">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {result?.term_summary?.map((t) => (
                  <tr key={t.term}>
                    <td>{t.term}</td>
                    <td className="text-end">{formatKES(t.due)}</td>
                    <td className="text-end">{formatKES(t.paid)}</td>
                    <td className="text-end">{formatKES(t.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "debtors" && !loading && (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th className="text-end">Owing</th>
                </tr>
              </thead>
              <tbody>
                {result?.top_debtors?.map((d) => (
                  <tr key={d.admission_no}>
                    <td>{d.name} ({d.admission_no})</td>
                    <td>{d.classroom}</td>
                    <td className="text-end">{formatKES(d.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}