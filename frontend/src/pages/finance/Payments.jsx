import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { financeApi, paymentsApi, calendarApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";

const currency = (value) => Number(value || 0).toLocaleString();

const METHOD_LABEL = {
  MPESA: "M-Pesa",
  BANK: "Bank",
  CASH: "Cash",
  CHEQUE: "Cheque",
};

const METHOD_BADGE = {
  MPESA: "badge-success",
  BANK: "badge-blue",
  CASH: "badge-gold",
  CHEQUE: "badge-neutral",
};

const METHOD_ICON = {
  MPESA: "bi-phone",
  BANK: "bi-building",
  CASH: "bi-cash",
  CHEQUE: "bi-file-text",
};

// Groups a flat list of Invoice objects (from InvoiceSerializer) into
// one card per student, keyed by admission_no.
const groupInvoicesByStudent = (invoiceList) => {
  const byAdmission = new Map();
  invoiceList.forEach((inv) => {
    if (!byAdmission.has(inv.admission_no)) {
      byAdmission.set(inv.admission_no, {
        admission_no: inv.admission_no,
        student_name: inv.student_name,
        invoices: [],
      });
    }
    byAdmission.get(inv.admission_no).invoices.push(inv);
  });
  return Array.from(byAdmission.values());
};

export default function FinancePayments() {
  // ---------------------------------------------------------------------
  // STEP 1 - find a student by admission number / name, see what they owe
  // ---------------------------------------------------------------------
  const [studentQuery, setStudentQuery] = useState("");
  const [debouncedStudentQuery, setDebouncedStudentQuery] = useState("");
  const [studentSearchLoading, setStudentSearchLoading] = useState(false);
  const [studentResults, setStudentResults] = useState([]); // [{admission_no, student_name, invoices:[]}]
  const [expandedAdmission, setExpandedAdmission] = useState(null);
  const [studentSearchError, setStudentSearchError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedStudentQuery(studentQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [studentQuery]);

  const runStudentSearch = async (term) => {
    if (!term) {
      setStudentResults([]);
      setExpandedAdmission(null);
      return;
    }
    setStudentSearchLoading(true);
    setStudentSearchError("");
    try {
      const { data } = await financeApi.invoices({ search: term, page_size: 200 });
      const rows = data.results ?? data;
      const outstanding = rows.filter((inv) => Number(inv.balance) > 0);
      const grouped = groupInvoicesByStudent(outstanding);
      setStudentResults(grouped);
      // auto-expand when there's exactly one match, or keep the same
      // student expanded across a refresh (e.g. right after a payment)
      if (grouped.length === 1) {
        setExpandedAdmission(grouped[0].admission_no);
      } else if (!grouped.some((g) => g.admission_no === expandedAdmission)) {
        setExpandedAdmission(null);
      }
      if (grouped.length === 0) {
        setStudentSearchError("No matching student with an outstanding balance was found.");
      }
    } catch (err) {
      setStudentSearchError("Could not search invoices. Please try again.");
    } finally {
      setStudentSearchLoading(false);
    }
  };

  useEffect(() => {
    runStudentSearch(debouncedStudentQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedStudentQuery]);

  const clearStudentSearch = () => {
    setStudentQuery("");
    setDebouncedStudentQuery("");
    setStudentResults([]);
    setExpandedAdmission(null);
    setStudentSearchError("");
  };

  // ---------------------------------------------------------------------
  // STEP 2 - pay a specific invoice (overpayment allowed -> credit)
  // ---------------------------------------------------------------------
  const [payingInvoice, setPayingInvoice] = useState(null); // the Invoice object being paid
  const [paymentDraft, setPaymentDraft] = useState({ amount: "", method: "MPESA", reference: "" });
  const [recording, setRecording] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const openPaymentPanel = (invoice) => {
    setPayingInvoice(invoice);
    setPaymentDraft({ amount: String(invoice.balance), method: "MPESA", reference: "" });
    setPaymentError("");
  };

  const closePaymentPanel = () => {
    setPayingInvoice(null);
    setPaymentError("");
  };

  const amountNumber = Number(paymentDraft.amount || 0);
  const excessOverBalance =
    payingInvoice && amountNumber > Number(payingInvoice.balance)
      ? amountNumber - Number(payingInvoice.balance)
      : 0;

  // ---------------------------------------------------------------------
  // STEP 3 - receipt (fetched from the backend, includes the QR code)
  // ---------------------------------------------------------------------
  const [receipt, setReceipt] = useState(null); // ReceiptSerializer payload + a couple of extra fields
  const [receiptLoading, setReceiptLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!payingInvoice) return;
    setRecording(true);
    setPaymentError("");
    try {
      const { data: payment } = await financeApi.recordPayment({
        invoice: payingInvoice.id,
        amount: paymentDraft.amount,
        method: paymentDraft.method,
        reference: paymentDraft.reference,
      });

      setReceiptLoading(true);
      const { data: receiptData } = await paymentsApi.receipt(payment.id);
      setReceipt({
        ...receiptData,
        excess: excessOverBalance,
      });

      setPayingInvoice(null);
      setMessage("Payment recorded. The receipt is ready below.");
      setMessageType("success");

      // refresh this student's outstanding invoices and the history table
      runStudentSearch(debouncedStudentQuery);
      loadPayments(1);
    } catch (err) {
      setPaymentError(
        err.response?.data ? JSON.stringify(err.response.data) : "Could not record this payment."
      );
    } finally {
      setRecording(false);
      setReceiptLoading(false);
    }
  };

  const downloadReceiptPdf = (r) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(14);
    doc.setTextColor(33, 37, 41);
    doc.text("Official Payment Receipt", pageWidth / 2, 16, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(108, 117, 125);
    doc.text(`Receipt No: ${r.receipt_no}`, 14, 26);
    doc.text(`Date: ${new Date(r.paid_at).toLocaleString("en-KE")}`, 14, 31);

    doc.setDrawColor(222, 226, 230);
    doc.line(14, 35, pageWidth - 14, 35);

    const rows = [
      ["Student", r.student_name],
      ["Admission No", r.admission_no],
      ["Term", r.term],
      ["Amount Paid", `KES ${currency(r.amount)}`],
      ["Method", METHOD_LABEL[r.method] || r.method],
      ["Reference", r.reference || "-"],
    ];

    autoTable(doc, {
      startY: 40,
      body: rows,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 32 } },
    });

    let cursorY = doc.lastAutoTable.finalY + 6;

    if (r.excess > 0) {
      doc.setFontSize(9);
      doc.setTextColor(25, 135, 84);
      const note = doc.splitTextToSize(
        `This payment exceeds the amount due by KES ${currency(r.excess)}. The excess has been ` +
          `recorded as a credit and will automatically reduce the student's next invoice.`,
        pageWidth - 28
      );
      doc.text(note, 14, cursorY);
      cursorY += note.length * 4 + 4;
    }

    if (r.qr_code_base64) {
      const qrSize = 28;
      const qrX = (pageWidth - qrSize) / 2;
      doc.addImage(`data:image/png;base64,${r.qr_code_base64}`, "PNG", qrX, cursorY, qrSize, qrSize);
      doc.setFontSize(8);
      doc.setTextColor(108, 117, 125);
      doc.text("Scan to verify this receipt", pageWidth / 2, cursorY + qrSize + 5, { align: "center" });
    }

    doc.save(`receipt_${r.receipt_no}.pdf`);
  };

  // ---------------------------------------------------------------------
  // filter dropdown options (for the payment history table below)
  // ---------------------------------------------------------------------
  const [academicYears, setAcademicYears] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [terms, setTerms] = useState([]);

  useEffect(() => {
    calendarApi.academicYears().then(({ data }) => setAcademicYears(data.results ?? data));
    academicsApi.gradeLevels().then(({ data }) => setGradeLevels(data.results ?? data));
    academicsApi.streams().then(({ data }) => setStreams(data.results ?? data));
    calendarApi.terms().then(({ data }) => setTerms(data.results ?? data));
  }, []);

  // ---- payments list: filters, search, pagination ----
  const [filters, setFilters] = useState({
    invoice__enrollment__academic_year: "",
    invoice__enrollment__classroom__grade_level: "",
    invoice__enrollment__classroom__stream: "",
    invoice__fee_structure__term: "",
    method: "",
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [payments, setPayments] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [listLoading, setListLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const activeParams = useMemo(() => {
    const params = { page_size: pageSize };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [filters, debouncedSearch]);

  const loadPayments = async (targetPage = page) => {
    setListLoading(true);
    try {
      const { data } = await financeApi.payments({ ...activeParams, page: targetPage });
      setPayments(data.results ?? data);
      setCount(data.count ?? (data.results ?? data).length);
      setPage(targetPage);
    } catch (error) {
      console.error("Failed to load payments:", error);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadPayments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParams]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const clearFilters = () => {
    setFilters({
      invoice__enrollment__academic_year: "",
      invoice__enrollment__classroom__grade_level: "",
      invoice__enrollment__classroom__stream: "",
      invoice__fee_structure__term: "",
      method: "",
    });
    setSearch("");
    setDebouncedSearch("");
  };

  const hasActiveFilters =
    filters.invoice__enrollment__academic_year ||
    filters.invoice__enrollment__classroom__grade_level ||
    filters.invoice__enrollment__classroom__stream ||
    filters.invoice__fee_structure__term ||
    filters.method ||
    search;

  // ---- Excel export ----
  const downloadExcel = async () => {
    setExportingExcel(true);
    try {
      const { data } = await financeApi.payments({ ...activeParams, page_size: 5000, page: 1 });
      const rows = data.results ?? data;

      const sheetData = rows.map((p) => ({
        "Date Paid": p.paid_at ? new Date(p.paid_at).toLocaleString() : "",
        "Admission No": p.admission_no,
        "Student Name": p.student_name,
        "Student Phone": p.student_phone,
        "Guardian Name": p.guardian_name || "",
        "Guardian Phone": p.guardian_phone || "",
        "Classroom": p.classroom,
        "Academic Year": p.academic_year,
        "Term": p.term,
        "Amount (KES)": Number(p.amount),
        "Method": METHOD_LABEL[p.method] || p.method,
        "Reference": p.reference || "",
        "Receipt No": p.receipt_no || "",
        "Recorded By": p.recorded_by_name,
      }));

      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");

      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `payments_${stamp}.xlsx`);
    } catch (error) {
      console.error("Failed to export Excel:", error);
    } finally {
      setExportingExcel(false);
    }
  };

  // ---- PDF export (payment history, not the receipt) ----
  const downloadPdf = async () => {
    setExportingPdf(true);
    try {
      const { data } = await financeApi.payments({ ...activeParams, page_size: 5000, page: 1 });
      const rows = data.results ?? data;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(16);
      doc.setTextColor(33, 37, 41);
      doc.text("Payment History Report", 14, 15);

      doc.setFontSize(10);
      doc.setTextColor(108, 117, 125);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
      doc.text(`Total Records: ${rows.length}`, 14, 27);

      const tableColumn = [
        "Date", "Admission", "Student Name", "Class", "Term",
        "Amount (KES)", "Method", "Reference", "Recorded By",
      ];

      const tableRows = rows.map((p) => [
        p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-KE") : "-",
        p.admission_no,
        p.student_name,
        p.classroom || "-",
        p.term || "-",
        currency(p.amount),
        METHOD_LABEL[p.method] || p.method,
        p.reference || "-",
        p.recorded_by_name || "-",
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 32,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [41, 128, 185] },
        alternateRowStyles: { fillColor: [248, 249, 250] },
      });

      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`payments_report_${stamp}.pdf`);
    } catch (error) {
      console.error("Failed to export PDF:", error);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div>
      <Breadcrumb items={[
        { label: "Dashboard", href: "/finance" },
        { label: "Payments", href: "/finance/payments" },
        { label: "All Payments", href: "#" },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Record and manage all fee payments made by students
          </p>
        </div>
        <span className="badge badge-neutral" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
          <i className="bi bi-cash-stack me-1"></i>
          {count} payments
        </span>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage("")}></button>
        </div>
      )}

      {/* ================= STEP 1: FIND STUDENT ================= */}
      <div className="card p-4 mb-4">
        <h6 className="mb-1" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-search me-2" style={{ color: "var(--blue-700)" }}></i>
          Record a Payment
        </h6>
        <p className="text-muted-soft mb-3" style={{ fontSize: "var(--fs-sm)" }}>
          Search for the student by admission number or name to see their outstanding invoices.
        </p>

        <div className="row g-2 align-items-end">
          <div className="col-md-8">
            <label className="form-label">Admission No. or Student Name</label>
            <div className="input-group">
              <span className="input-group-text bg-white"><i className="bi bi-person-badge"></i></span>
              <input
                className="form-control"
                placeholder="e.g. 00081 or Jane Wanjiru"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                autoFocus
              />
              {studentQuery && (
                <button className="btn btn-outline-secondary" type="button" onClick={clearStudentSearch}>
                  <i className="bi bi-x-lg"></i>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* search state */}
        <div className="mt-3">
          {studentSearchLoading && (
            <div className="d-flex align-items-center text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
              <span className="spinner-border spinner-border-sm me-2"></span>
              Searching...
            </div>
          )}

          {!studentSearchLoading && !debouncedStudentQuery && (
            <div className="empty-state py-3">
              <i className="bi bi-person-lines-fill"></i>
              <p className="text-muted-soft mb-0">
                Start typing an admission number or student name to bring up their fee balance.
              </p>
            </div>
          )}

          {!studentSearchLoading && debouncedStudentQuery && studentSearchError && (
            <div className="alert alert-warning py-2 mb-0" style={{ fontSize: "var(--fs-sm)" }}>
              <i className="bi bi-info-circle me-1"></i>
              {studentSearchError}
            </div>
          )}

          {!studentSearchLoading && studentResults.length > 0 && (
            <div className="d-flex flex-column gap-2">
              {studentResults.map((s) => {
                const isOpen = expandedAdmission === s.admission_no;
                const totalOwed = s.invoices.reduce((sum, inv) => sum + Number(inv.balance), 0);
                return (
                  <div key={s.admission_no} className="border rounded-3 overflow-hidden">
                    <button
                      type="button"
                      className="w-100 border-0 bg-white d-flex justify-content-between align-items-center px-3 py-2"
                      onClick={() => setExpandedAdmission(isOpen ? null : s.admission_no)}
                      style={{ cursor: "pointer" }}
                    >
                      <span>
                        <span style={{ fontWeight: 600, color: "var(--blue-700)" }}>{s.admission_no}</span>
                        {"  "}
                        <span style={{ color: "var(--ink-900)" }}>{s.student_name}</span>
                        <span className="badge badge-neutral ms-2">
                          {s.invoices.length} unpaid invoice{s.invoices.length !== 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="d-flex align-items-center gap-2">
                        <span className="fw-bold" style={{ color: "var(--danger-600, #dc3545)" }}>
                          KES {currency(totalOwed)}
                        </span>
                        <i className={`bi ${isOpen ? "bi-chevron-up" : "bi-chevron-down"}`}></i>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="table-responsive border-top">
                        <table className="table table-sm mb-0">
                          <thead>
                            <tr>
                              <th>Term</th>
                              <th>Class</th>
                              <th className="text-end">Due</th>
                              <th className="text-end">Paid</th>
                              <th className="text-end">Balance</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.invoices.map((inv) => (
                              <tr key={inv.id}>
                                <td>{inv.term_label}</td>
                                <td>{inv.grade_level_name}</td>
                                <td className="text-end">KES {currency(inv.amount_due)}</td>
                                <td className="text-end">KES {currency(inv.amount_paid)}</td>
                                <td className="text-end fw-bold">KES {currency(inv.balance)}</td>
                                <td className="text-end">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    onClick={() => openPaymentPanel(inv)}
                                  >
                                    <i className="bi bi-cash-coin me-1"></i>
                                    Pay
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================= STEP 2: PAYMENT PANEL (MODAL) ================= */}
      {payingInvoice && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(15,23,42,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title mb-0" style={{ fontWeight: 700 }}>
                  <i className="bi bi-cash-coin me-2" style={{ color: "var(--blue-700)" }}></i>
                  Record Payment
                </h6>
                <button type="button" className="btn-close" onClick={closePaymentPanel}></button>
              </div>
              <form onSubmit={submitPayment}>
                <div className="modal-body">
                  <div className="d-flex justify-content-between mb-3 p-2 rounded-2" style={{ background: "var(--surface-100, #f8f9fa)" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{payingInvoice.student_name}</div>
                      <div className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                        {payingInvoice.admission_no} · {payingInvoice.term_label}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>Balance due</div>
                      <div className="fw-bold" style={{ color: "var(--danger-600, #dc3545)" }}>
                        KES {currency(payingInvoice.balance)}
                      </div>
                    </div>
                  </div>

                  {paymentError && (
                    <div className="alert alert-danger py-2" style={{ fontSize: "var(--fs-sm)" }}>{paymentError}</div>
                  )}

                  <div className="mb-3">
                    <label className="form-label">Amount Received (KES)</label>
                    <input
                      type="number"
                      className="form-control"
                      required
                      min="1"
                      step="1"
                      value={paymentDraft.amount}
                      onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })}
                    />
                    {excessOverBalance > 0 ? (
                      <div className="form-text-hint text-success">
                        <i className="bi bi-info-circle me-1"></i>
                        KES {currency(excessOverBalance)} above the balance will be saved as credit and
                        automatically applied to this student's next term invoice.
                      </div>
                    ) : (
                      <div className="form-text-hint">Leave as-is for a full settlement, or edit for a partial payment.</div>
                    )}
                  </div>

                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Method</label>
                      <select
                        className="form-select"
                        value={paymentDraft.method}
                        onChange={(e) => setPaymentDraft({ ...paymentDraft, method: e.target.value })}
                      >
                        <option value="MPESA">M-Pesa</option>
                        <option value="BANK">Bank</option>
                        <option value="CASH">Cash</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Reference</label>
                      <input
                        className="form-control"
                        placeholder="M-Pesa code / receipt no."
                        value={paymentDraft.reference}
                        onChange={(e) => setPaymentDraft({ ...paymentDraft, reference: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={closePaymentPanel}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={recording}>
                    {recording ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Recording...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check2-circle me-1"></i>
                        Confirm Payment
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: RECEIPT ================= */}
      {(receipt || receiptLoading) && (
        <div className="card p-4 mb-4">
          <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
            <i className="bi bi-receipt-cutoff me-2" style={{ color: "var(--success-600, #198754)" }}></i>
            Receipt
          </h6>

          {receiptLoading && (
            <div className="d-flex align-items-center text-muted-soft">
              <span className="spinner-border spinner-border-sm me-2"></span>
              Preparing receipt...
            </div>
          )}

          {receipt && !receiptLoading && (
            <div className="row g-4 align-items-center">
              <div className="col-md-8">
                <div className="row g-2">
                  <div className="col-6"><span className="text-muted-soft">Receipt No.</span></div>
                  <div className="col-6 fw-bold">{receipt.receipt_no}</div>

                  <div className="col-6"><span className="text-muted-soft">Student</span></div>
                  <div className="col-6">{receipt.student_name} ({receipt.admission_no})</div>

                  <div className="col-6"><span className="text-muted-soft">Term</span></div>
                  <div className="col-6">{receipt.term}</div>

                  <div className="col-6"><span className="text-muted-soft">Amount Paid</span></div>
                  <div className="col-6 fw-bold" style={{ color: "var(--success-600, #198754)" }}>
                    KES {currency(receipt.amount)}
                  </div>

                  <div className="col-6"><span className="text-muted-soft">Method</span></div>
                  <div className="col-6">
                    <span className={`badge ${METHOD_BADGE[receipt.method] || "badge-neutral"}`}>
                      <i className={`bi ${METHOD_ICON[receipt.method] || "bi-credit-card"} me-1`}></i>
                      {METHOD_LABEL[receipt.method] || receipt.method}
                    </span>
                  </div>

                  <div className="col-6"><span className="text-muted-soft">Reference</span></div>
                  <div className="col-6">{receipt.reference || "-"}</div>

                  <div className="col-6"><span className="text-muted-soft">Date</span></div>
                  <div className="col-6">{new Date(receipt.paid_at).toLocaleString("en-KE")}</div>
                </div>

                {receipt.excess > 0 && (
                  <div className="alert alert-success mt-3 mb-0 py-2" style={{ fontSize: "var(--fs-sm)" }}>
                    <i className="bi bi-piggy-bank me-1"></i>
                    KES {currency(receipt.excess)} was paid above the balance and has been carried
                    forward as credit toward the student's next invoice.
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-success mt-3"
                  onClick={() => downloadReceiptPdf(receipt)}
                >
                  <i className="bi bi-file-earmark-pdf me-2"></i>
                  Download Receipt (PDF)
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary mt-3 ms-2"
                  onClick={() => setReceipt(null)}
                >
                  Dismiss
                </button>
              </div>

              {receipt.qr_code_base64 && (
                <div className="col-md-4 text-center">
                  <img
                    src={`data:image/png;base64,${receipt.qr_code_base64}`}
                    alt="Receipt verification QR code"
                    style={{ width: "140px", height: "140px" }}
                  />
                  <div className="text-muted-soft mt-1" style={{ fontSize: "var(--fs-xs)" }}>
                    Scan to verify this receipt
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= FILTERS + SEARCH + EXPORT ================= */}
      <div className="card p-4 mb-4">
        <h6 className="mb-3" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
          <i className="bi bi-funnel me-2" style={{ color: "var(--blue-700)" }}></i>
          Filter Payment History
        </h6>
        <div className="row g-3">
          <div className="col-md-2">
            <label className="form-label">Academic Year</label>
            <select
              className="form-select"
              value={filters.invoice__enrollment__academic_year}
              onChange={(e) => updateFilter("invoice__enrollment__academic_year", e.target.value)}
            >
              <option value="">All</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.year}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Grade</label>
            <select
              className="form-select"
              value={filters.invoice__enrollment__classroom__grade_level}
              onChange={(e) => updateFilter("invoice__enrollment__classroom__grade_level", e.target.value)}
            >
              <option value="">All</option>
              {gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Stream</label>
            <select
              className="form-select"
              value={filters.invoice__enrollment__classroom__stream}
              onChange={(e) => updateFilter("invoice__enrollment__classroom__stream", e.target.value)}
            >
              <option value="">All</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Term</label>
            <select
              className="form-select"
              value={filters.invoice__fee_structure__term}
              onChange={(e) => updateFilter("invoice__fee_structure__term", e.target.value)}
            >
              <option value="">All</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.term_number ? `Term ${t.term_number}` : `Term #${t.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Method</label>
            <select
              className="form-select"
              value={filters.method}
              onChange={(e) => updateFilter("method", e.target.value)}
            >
              <option value="">All</option>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div className="col-md-2 d-flex align-items-end">
            <button className="btn btn-outline-secondary w-100" onClick={clearFilters} type="button">
              <i className="bi bi-arrow-counterclockwise me-1"></i>
              Clear Filters
            </button>
          </div>

          <div className="col-md-6">
            <label className="form-label">
              <i className="bi bi-search me-1" style={{ color: "var(--blue-700)" }}></i>
              Search Student
            </label>
            <input
              className="form-control"
              placeholder="Admission no. or student name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <button className="btn btn-success w-100" onClick={downloadExcel} disabled={exportingExcel} type="button">
              {exportingExcel ? (
                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Preparing...</>
              ) : (
                <><i className="bi bi-file-earmark-excel me-2"></i>Download Excel</>
              )}
            </button>
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <button className="btn btn-danger w-100" onClick={downloadPdf} disabled={exportingPdf} type="button">
              {exportingPdf ? (
                <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Preparing...</>
              ) : (
                <><i className="bi bi-file-earmark-pdf me-2"></i>Download PDF</>
              )}
            </button>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="d-flex flex-wrap gap-1 mt-3">
            {filters.invoice__enrollment__academic_year && (
              <span className="filter-chip">
                Year: {academicYears.find(y => String(y.id) === String(filters.invoice__enrollment__academic_year))?.year}
                <button onClick={() => updateFilter("invoice__enrollment__academic_year", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.invoice__enrollment__classroom__grade_level && (
              <span className="filter-chip">
                Grade: {gradeLevels.find(g => String(g.id) === String(filters.invoice__enrollment__classroom__grade_level))?.name}
                <button onClick={() => updateFilter("invoice__enrollment__classroom__grade_level", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.invoice__enrollment__classroom__stream && (
              <span className="filter-chip">
                Stream: {streams.find(s => String(s.id) === String(filters.invoice__enrollment__classroom__stream))?.name}
                <button onClick={() => updateFilter("invoice__enrollment__classroom__stream", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.invoice__fee_structure__term && (
              <span className="filter-chip">
                Term: {terms.find(t => String(t.id) === String(filters.invoice__fee_structure__term))?.term_number}
                <button onClick={() => updateFilter("invoice__fee_structure__term", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {filters.method && (
              <span className="filter-chip">
                Method: {METHOD_LABEL[filters.method] || filters.method}
                <button onClick={() => updateFilter("method", "")}><i className="bi bi-x"></i></button>
              </span>
            )}
            {search && (
              <span className="filter-chip">
                Search: "{search}"
                <button onClick={() => setSearch("")}><i className="bi bi-x"></i></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ================= PAYMENTS TABLE ================= */}
      <div className="table-wrap">
        <div className="table-wrap__header">
          <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
            <i className="bi bi-list-ul me-2" style={{ color: "var(--blue-700)" }}></i>
            Payment History
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
            {count} payment{count !== 1 ? "s" : ""} found
          </span>
        </div>

        {listLoading ? (
          <TableSkeleton rows={5} columns={12} />
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-cash-stack"></i>
            <h6>No payments found</h6>
            <p className="text-muted-soft">
              {hasActiveFilters
                ? "No payments match your filters. Try adjusting your search criteria."
                : "No payments have been recorded yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Admission No</th>
                    <th>Student</th>
                    <th>Phone</th>
                    <th>Guardian</th>
                    <th>Guardian Phone</th>
                    <th>Class</th>
                    <th>Term</th>
                    <th className="text-end">Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-KE') : "-"}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                          {p.admission_no}
                        </span>
                      </td>
                      <td className="cell-name">{p.student_name}</td>
                      <td>{p.student_phone || <span className="text-muted-soft">-</span>}</td>
                      <td>{p.guardian_name || <span className="text-muted-soft">-</span>}</td>
                      <td>{p.guardian_phone || <span className="text-muted-soft">-</span>}</td>
                      <td><span className="badge badge-neutral">{p.classroom}</span></td>
                      <td>{p.term}</td>
                      <td className="text-end fw-bold" style={{ color: "var(--success-600)" }}>
                        KES {currency(p.amount)}
                      </td>
                      <td>
                        <span className={`badge ${METHOD_BADGE[p.method] || "badge-neutral"}`}>
                          <i className={`bi ${METHOD_ICON[p.method] || "bi-credit-card"} me-1`}></i>
                          {METHOD_LABEL[p.method] || p.method}
                        </span>
                      </td>
                      <td>
                        {p.reference ? (
                          <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>{p.reference}</span>
                        ) : (
                          <span className="text-muted-soft">-</span>
                        )}
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>{p.recorded_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(newPage) => loadPayments(newPage)}
              itemsPerPage={pageSize}
              setItemsPerPage={() => {}}
              startIndex={(page - 1) * pageSize}
              endIndex={Math.min(page * pageSize, count)}
              totalItems={count}
            />
          </>
        )}
      </div>
    </div>
  );
}
