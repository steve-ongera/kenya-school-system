import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { financeApi, calendarApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";
import logoImage from "../../assets/junda_high_logo.png";

// Exact money display: keeps cents when present, never rounds a figure like 30,000 down.
const currency = (value) =>
  Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

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

// Positive = still owes, negative = prepaid credit, 0 = fully paid.
// Used on the on-screen receipt and the PDF (which is also what gets printed).
const describeBalance = (balance) => {
  const b = Number(balance || 0);
  if (b > 0) return { label: "Balance Remaining", value: `KES ${currency(b)}`, tone: "owing" };
  if (b < 0) return { label: "Prepaid Credit", value: `KES ${currency(Math.abs(b))}`, tone: "credit" };
  return { label: "Balance", value: "KES 0 (Fully paid)", tone: "clear" };
};

// Groups a flat list of Invoice objects (from InvoiceSerializer) into
// one entry per student, keyed by admission_no.
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

// Shared helper: load the Masomo logo as a base64 data URL
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

export default function FinancePayments() {
  // ---------------------------------------------------------------------
  // TABS - "payment" (record a payment + receipt) vs "payments" (history)
  // ---------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState("payment"); // "payment" | "payments"

  // ---------------------------------------------------------------------
  // STEP 1 - find a student by admission number / name, then SELECT them
  // ---------------------------------------------------------------------
  const [studentQuery, setStudentQuery] = useState("");
  const [debouncedStudentQuery, setDebouncedStudentQuery] = useState("");
  const [studentSearchLoading, setStudentSearchLoading] = useState(false);
  const [studentResults, setStudentResults] = useState([]); // [{admission_no, student_name, invoices:[]}]
  const [selectedAdmission, setSelectedAdmission] = useState(null);
  const [studentSearchError, setStudentSearchError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedStudentQuery(studentQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [studentQuery]);

  const runStudentSearch = async (term) => {
    if (!term) {
      setStudentResults([]);
      setSelectedAdmission(null);
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
      // exactly one match -> auto-select; otherwise keep the current pick if it is still listed
      if (grouped.length === 1) {
        setSelectedAdmission(grouped[0].admission_no);
      } else if (!grouped.some((g) => g.admission_no === selectedAdmission)) {
        setSelectedAdmission(null);
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
    setSelectedAdmission(null);
    setStudentSearchError("");
  };

  // ---------------------------------------------------------------------
  // STEP 2 - ONE Pay Balance button. The backend
  // (services.record_bulk_payment) splits the amount across the student's
  // unpaid invoices oldest-first; any excess is kept as prepaid credit.
  // ---------------------------------------------------------------------
  const [payingBalance, setPayingBalance] = useState(null); // { admission_no, student_name, totalOwed }
  const [paymentDraft, setPaymentDraft] = useState({ amount: "", method: "MPESA", reference: "" });
  const [recording, setRecording] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Bank-style verification step shown BEFORE the payment is actually recorded.
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const openBalancePaymentPanel = (student, totalOwed) => {
    setPayingBalance({
      admission_no: student.admission_no,
      student_name: student.student_name,
      totalOwed,
    });
    setPaymentDraft({ amount: String(totalOwed), method: "MPESA", reference: "" });
    setPaymentError("");
    setShowConfirm(false);
    setConfirmChecked(false);
  };

  const closePaymentPanel = () => {
    if (recording) return; // never close while a payment is being saved
    setPayingBalance(null);
    setPaymentError("");
    setShowConfirm(false);
    setConfirmChecked(false);
  };

  const amountNumber = Number(paymentDraft.amount || 0);
  const activeBalanceDue = payingBalance ? payingBalance.totalOwed : 0;
  const excessOverBalance = amountNumber > activeBalanceDue ? amountNumber - activeBalanceDue : 0;
  // What the student will still owe (or hold as credit, if negative) after this payment.
  const balanceAfterPayment = activeBalanceDue - amountNumber;

  // ---------------------------------------------------------------------
  // STEP 3 - receipt (fetched from the backend, includes QR + allocations + balance)
  // ---------------------------------------------------------------------
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  // Form submit only validates, then opens the verification popup.
  const requestConfirmation = (e) => {
    e.preventDefault();
    if (!payingBalance || recording) return;
    if (!(amountNumber > 0)) {
      setPaymentError("Enter an amount greater than zero.");
      return;
    }
    setPaymentError("");
    setConfirmChecked(false);
    setShowConfirm(true);
  };

  const cancelConfirmation = () => {
    if (recording) return;
    setShowConfirm(false);
    setConfirmChecked(false);
  };

  // Runs only after the cashier verifies and confirms in the popup.
  const submitPayment = async () => {
    if (!payingBalance || recording) return;
    if (!(amountNumber > 0)) {
      setShowConfirm(false);
      setPaymentError("Enter an amount greater than zero.");
      return;
    }
    setRecording(true);
    setPaymentError("");
    try {
      const { data } = await financeApi.recordBulkPayment({
        admission_no: payingBalance.admission_no,
        amount: paymentDraft.amount,
        method: paymentDraft.method,
        reference: paymentDraft.reference,
      });

      // Accuracy check: what the server recorded must equal what was typed
      const recordedTotal = (data.payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
      const mismatch = Math.abs(recordedTotal - amountNumber) > 0.005;

      setReceiptLoading(true);
      const { data: receiptData } = await financeApi.paymentReceipt(data.last_payment_id);
      setReceipt({ ...receiptData, excess: excessOverBalance, payment_id: data.last_payment_id });

      const studentName = payingBalance.student_name;
      setPayingBalance(null);

      if (mismatch) {
        setMessage(
          `WARNING: you entered KES ${currency(amountNumber)} but KES ${currency(recordedTotal)} was recorded. Please verify before giving out the receipt.`
        );
        setMessageType("danger");
      } else {
        setMessage(
          `Payment of KES ${currency(recordedTotal)} recorded for ${studentName}. The receipt is ready below.`
        );
        setMessageType("success");
      }

      // refresh this student's outstanding invoices and the history table
      runStudentSearch(debouncedStudentQuery);
      loadPayments(1);
    } catch (err) {
      setPaymentError(
        err.response?.data?.detail ||
          (err.response?.data ? JSON.stringify(err.response.data) : "Could not record this payment.")
      );
    } finally {
      setRecording(false);
      setReceiptLoading(false);
      setShowConfirm(false);
      setConfirmChecked(false);
    }
  };

  // ---- Build the professional A5 receipt PDF. ALWAYS exactly ONE page. ----
  // Compact fonts, fixed-position bottom block (QR + stamp + signatures +
  // copyright footer), and no addPage() anywhere - so it can never spill
  // onto a second page. Long "Applied to" lists switch to a two-column grid.
  //
  // This is the SINGLE source of truth for the receipt layout: the download
  // button saves it, and the print button prints the very same document, so
  // the two are always identical.
  const buildReceiptPdf = async (r) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pageWidth = doc.internal.pageSize.getWidth(); // 148
    const pageHeight = doc.internal.pageSize.getHeight(); // 210
    const marginX = 10;
    const year = new Date().getFullYear();

    const base64Logo = await getImageBase64(logoImage);

    // --- Header ---
    // Keep the logo's real aspect ratio (no squeezing) and make it a bit bigger.
    let logoW = 0;
    const logoH = 13;
    if (base64Logo) {
      const props = doc.getImageProperties(base64Logo);
      const ratio = props.width / props.height || 1;
      logoW = Math.min(logoH * ratio, 28); // cap the width so long logos don't crowd the title
      const drawH = logoW / ratio; // recompute height if the width was capped
      doc.addImage(base64Logo, "PNG", marginX, 7.5 + (logoH - drawH) / 2, logoW, drawH);
    }
    const textX = base64Logo ? marginX + logoW + 3 : marginX;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Junda High School Shanzu", textX, 12.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Official Payment Receipt", textX, 17);

    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated ${new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" })}`,
      pageWidth - marginX,
      12,
      { align: "right" }
    );

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(marginX, 21, pageWidth - marginX, 21);

    // --- Receipt number + date strip ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Receipt No: ${r.receipt_no}`, marginX, 26);
    doc.text(`Date: ${new Date(r.paid_at).toLocaleString("en-KE")}`, pageWidth - marginX, 26, {
      align: "right",
    });

    // --- Info table ---
    // Balance row (index 5): red when the student still owes, green when prepaid.
    const bal = describeBalance(r.balance);
    const BALANCE_ROW_INDEX = 5;

    const rows = [
      ["Student", r.student_name],
      ["Admission No", r.admission_no],
      ["Current Class", r.classroom || "-"],
      ["Term", r.term || "-"],
      ["Amount Paid", `KES ${currency(r.amount)}`],
      [bal.label, bal.value],
      ["Method", METHOD_LABEL[r.method] || r.method],
      ["Reference", r.reference || "-"],
      ["Recorded By", r.recorded_by_name || "-"],
    ];

    autoTable(doc, {
      startY: 29,
      margin: { left: marginX, right: marginX },
      pageBreak: "avoid",
      body: rows,
      theme: "grid",
      styles: {
        fontSize: 7.5,
        cellPadding: 1.3,
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
        textColor: [51, 65, 85],
        overflow: "ellipsize",
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 30, fillColor: [241, 245, 249] },
        1: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === BALANCE_ROW_INDEX) {
          data.cell.styles.fontStyle = "bold";
          if (data.column.index === 1) {
            data.cell.styles.textColor =
              bal.tone === "owing"
                ? [185, 28, 28]
                : bal.tone === "credit"
                ? [22, 101, 52]
                : [51, 65, 85];
          }
        }
      },
    });

    // --- Breakdown: which terms this payment was applied to ---
    if (r.allocations && r.allocations.length > 1) {
      const allocs = r.allocations;
      let head;
      let body;
      if (allocs.length > 5) {
        // two side-by-side columns keep long lists short
        const half = Math.ceil(allocs.length / 2);
        head = [["Applied To", "Amount (KES)", "Applied To", "Amount (KES)"]];
        body = Array.from({ length: half }, (_, i) => {
          const left = allocs[i];
          const right = allocs[i + half];
          return [
            left.term,
            currency(left.amount),
            right ? right.term : "",
            right ? currency(right.amount) : "",
          ];
        });
      } else {
        head = [["Applied To", "Amount (KES)"]];
        body = allocs.map((a) => [a.term, currency(a.amount)]);
      }

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 3,
        margin: { left: marginX, right: marginX },
        pageBreak: "avoid",
        head,
        body,
        theme: "grid",
        styles: { fontSize: 6.8, cellPadding: 1, overflow: "ellipsize" },
        headStyles: { fillColor: [71, 85, 105] },
        columnStyles:
          allocs.length > 5 ? { 1: { halign: "right" }, 3: { halign: "right" } } : { 1: { halign: "right" } },
      });
    }

    let cursorY = doc.lastAutoTable.finalY + 4;

    // --- Excess / overpayment note ---
    if (r.excess > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(25, 135, 84);
      const note = doc.splitTextToSize(
        `This payment exceeds the amount due by KES ${currency(r.excess)}. The excess has been ` +
          `recorded as a credit and will automatically reduce the student's next invoice.`,
        pageWidth - marginX * 2
      );
      doc.text(note, marginX, cursorY);
      cursorY += note.length * 3.2;
    }

    // ================================================================
    // BOTTOM BLOCK - pinned to fixed positions from the page bottom:
    //   QR + stamp row  ->  signatures  ->  copyright footer
    // ================================================================
    const footerLineY = pageHeight - 15;
    const sigY = footerLineY - 12;
    const qrSize = 28;
    const qrX = marginX;
    const qrY = sigY - qrSize - 10;

    if (r.qr_code_base64) {
      doc.addImage(`data:image/png;base64,${r.qr_code_base64}`, "PNG", qrX, qrY, qrSize, qrSize);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text("Scan to verify this receipt", qrX + qrSize / 2, qrY + qrSize + 3, { align: "center" });
    } else {
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.rect(qrX, qrY, qrSize, qrSize);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text("Verification QR", qrX + qrSize / 2, qrY + qrSize / 2 - 1, { align: "center" });
      doc.text("unavailable", qrX + qrSize / 2, qrY + qrSize / 2 + 3, { align: "center" });
    }

    // Official stamp box, same row as the QR
    const stampX = qrX + qrSize + 5;
    const stampWidth = pageWidth - stampX - marginX;

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.2);
    doc.rect(stampX, qrY, stampWidth, qrSize);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text("Official School Stamp", stampX + stampWidth / 2, qrY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text("(Stamp here)", stampX + stampWidth / 2, qrY + qrSize / 2 + 2, { align: "center" });

    // Signature lines
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text("Finance Officer's Signature:", marginX, sigY);
    doc.line(marginX, sigY + 6, pageWidth / 2 - 3, sigY + 6);
    doc.text("Principal's Signature:", pageWidth / 2 + 3, sigY);
    doc.line(pageWidth / 2 + 3, sigY + 6, pageWidth - marginX, sigY + 6);

    // Copyright / anti-duplication footer (always on the page)
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.15);
    doc.line(marginX, footerLineY, pageWidth - marginX, footerLineY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(51, 65, 85);
    doc.text(`© ${year} Junda High School Shanzu. All rights reserved.`, marginX, footerLineY + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Finance Department", pageWidth - marginX, footerLineY + 4, { align: "right" });
    doc.text(
      "This is an official payment receipt. Duplication or unauthorized reproduction is prohibited.",
      marginX,
      footerLineY + 7.5
    );

    return doc;
  };

  // ---- Download the receipt PDF ----
  const downloadReceiptPdf = async (r) => {
    const doc = await buildReceiptPdf(r);
    doc.save(`receipt_${r.receipt_no}.pdf`);
  };

  // ---- Print a receipt (from the receipt panel or the payment history list) ----
  // Prints the exact same PDF that the download button produces.
  const [printingReceiptId, setPrintingReceiptId] = useState(null);

  const handlePrintPaymentReceipt = async (payment) => {
    try {
      setPrintingReceiptId(payment.id);
      const { data: r } = await financeApi.paymentReceipt(payment.id);

      // Same PDF as the download, so print and download always match
      const doc = await buildReceiptPdf(r);
      const blobUrl = URL.createObjectURL(doc.output("blob"));

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      iframe.src = blobUrl;

      const cleanup = () => {
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 60000); // keep alive long enough for the print dialog
      };

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (e) {
            // Fallback: open the PDF in a tab so the user can print from there
            window.open(blobUrl, "_blank");
          } finally {
            cleanup();
          }
        }, 300);
      };

      document.body.appendChild(iframe);
    } catch (err) {
      setMessage("Could not prepare the receipt for printing.");
      setMessageType("danger");
    } finally {
      setPrintingReceiptId(null);
    }
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
    date_from: "", // exact "paid from" date (YYYY-MM-DD), filtered in the DB
    date_to: "", // exact "paid to" date (YYYY-MM-DD), filtered in the DB
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
      date_from: "",
      date_to: "",
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
    filters.date_from ||
    filters.date_to ||
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
        Classroom: p.classroom,
        "Academic Year": p.academic_year,
        Term: p.term,
        "Amount (KES)": Number(p.amount),
        Method: METHOD_LABEL[p.method] || p.method,
        Reference: p.reference || "",
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
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 12;
      const year = new Date().getFullYear();
      const generatedOn = new Date().toLocaleString("en-KE");

      const base64Logo = await getImageBase64(logoImage);
      const totalAmount = rows.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Finance theme palette
      const NAVY = [15, 41, 71];
      const SLATE = [71, 85, 105];
      const LIGHT = [241, 245, 249];
      const GOLD = [180, 141, 40];
      const GREEN = [22, 101, 52];

      const drawHeader = () => {
        if (base64Logo) {
          doc.addImage(base64Logo, "PNG", marginX, 8, 12, 12);
        }
        const textX = base64Logo ? marginX + 15 : marginX;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...NAVY);
        doc.text("Junda High School Shanzu", textX, 14);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...SLATE);
        doc.text("Finance Department — Payment History Report", textX, 19);

        doc.setFontSize(8);
        doc.setTextColor(...SLATE);
        doc.text(`Generated: ${generatedOn}`, pageWidth - marginX, 11, { align: "right" });
        doc.text(`Total Records: ${rows.length}`, pageWidth - marginX, 16, { align: "right" });
        if (filters.date_from || filters.date_to) {
          doc.text(
            `Date range: ${filters.date_from || "..."} to ${filters.date_to || "..."}`,
            pageWidth - marginX,
            21,
            { align: "right" }
          );
        }

        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.6);
        doc.line(marginX, 24, pageWidth - marginX, 24);
      };

      const drawFooter = (pageNumber, pageCount) => {
        const footerY = pageHeight - 10;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...SLATE);
        doc.text(`© ${year} Junda High School Shanzu. All rights reserved.`, marginX, footerY);

        doc.setFont("helvetica", "normal");
        doc.text("Finance Department — Confidential", pageWidth / 2, footerY, { align: "center" });
        doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - marginX, footerY, { align: "right" });
      };

      // --- Page 1 header + totals strip ---
      drawHeader();
      doc.setFillColor(...LIGHT);
      doc.roundedRect(marginX, 28, pageWidth - marginX * 2, 10, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(`Total Collected: KES ${currency(totalAmount)}`, marginX + 4, 34.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE);
      doc.text(
        `Across ${rows.length} payment${rows.length !== 1 ? "s" : ""}`,
        pageWidth - marginX - 4,
        34.5,
        { align: "right" }
      );

      if (filters.date_from || filters.date_to) {
        doc.text(
          `Date range: ${filters.date_from || "..."} to ${filters.date_to || "..."}`,
          14,
          32
        );
      }

      const tableColumn = [
        "Date",
        "Admission",
        "Student Name",
        "Class",
        "Term",
        "Amount (KES)",
        "Method",
        "Reference",
        "Recorded By",
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
        startY: 42,
        margin: { left: marginX, right: marginX, top: 28, bottom: 16 },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          textColor: SLATE,
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
        },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 5: { halign: "right", fontStyle: "bold", textColor: GREEN } },
        didDrawPage: (data) => {
          // Repeat the branded header on every page after the first
          if (data.pageNumber > 1) drawHeader();
        },
      });

      // Copyright footer + page numbers on every page, drawn last so the
      // final page count is known.
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawFooter(i, pageCount);
      }

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
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/finance" },
          { label: "Payments", href: "/finance/payments" },
          { label: "All Payments", href: "#" },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Record and manage all fee payments made by students</p>
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

      {/* ================= TABS ================= */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === "payment" ? "active" : ""}`}
            onClick={() => setActiveTab("payment")}
          >
            <i className="bi bi-cash-coin me-1"></i>
            Payment
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === "payments" ? "active" : ""}`}
            onClick={() => setActiveTab("payments")}
          >
            <i className="bi bi-list-ul me-1"></i>
            Payments
            <span className="badge badge-neutral ms-2">{count}</span>
          </button>
        </li>
      </ul>

      {activeTab === "payment" && (
        <>
          {/* ================= STEP 1: FIND + SELECT STUDENT ================= */}
          <div className="card p-4 mb-4">
            <h6 className="mb-1" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
              <i className="bi bi-search me-2" style={{ color: "var(--blue-700)" }}></i>
              Record a Payment
            </h6>
            <p className="text-muted-soft mb-3" style={{ fontSize: "var(--fs-sm)" }}>
              Search for the student by admission number or name, then select them. The payment is applied
              to their oldest unpaid term first, so arrears are always cleared correctly. Anything paid
              above the total balance is saved as credit for the next term.
            </p>

            <div className="row g-2 align-items-end">
              <div className="col-md-8">
                <label className="form-label">Admission No. or Student Name</label>
                <div className="input-group">
                  <span className="input-group-text bg-white">
                    <i className="bi bi-person-badge"></i>
                  </span>
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

              {!studentSearchLoading &&
                studentResults.length > 0 &&
                (() => {
                  const selected = studentResults.find((s) => s.admission_no === selectedAdmission);

                  // The most recently issued invoice already folds in earlier arrears
                  // (brought_forward), so its balance is the student's total owed.
                  const latestInvoice = selected
                    ? [...selected.invoices].sort(
                        (a, b) => new Date(a.issued_at) - new Date(b.issued_at) || a.id - b.id
                      ).at(-1)
                    : null;
                  const totalOwed = latestInvoice ? Number(latestInvoice.balance) : 0;

                  return (
                    <>
                      <div className="text-muted-soft mb-2" style={{ fontSize: "var(--fs-sm)" }}>
                        {studentResults.length > 1 ? "Select the student to pay for:" : "Student found:"}
                      </div>
                      <div className="d-flex flex-column gap-2 mb-3">
                        {studentResults.map((s) => {
                          const isSelected = selectedAdmission === s.admission_no;
                          return (
                            <button
                              key={s.admission_no}
                              type="button"
                              onClick={() => setSelectedAdmission(isSelected ? null : s.admission_no)}
                              className={`btn text-start d-flex justify-content-between align-items-center px-3 py-2 ${
                                isSelected ? "btn-primary" : "btn-outline-secondary"
                              }`}
                            >
                              <span>
                                <strong>{s.admission_no}</strong>
                                {"  "}
                                {s.student_name}
                              </span>
                              {isSelected && <i className="bi bi-check-circle-fill"></i>}
                            </button>
                          );
                        })}
                      </div>

                      {selected && (
                        <div className="border rounded-3 overflow-hidden">
                          <div className="d-flex justify-content-between align-items-center px-3 py-3 bg-white">
                            <div>
                              <div style={{ fontWeight: 700 }}>{selected.student_name}</div>
                              <div className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                                {selected.admission_no}
                              </div>
                            </div>
                            <div className="text-end">
                              <div className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>
                                Total balance owed
                              </div>
                              <div className="fw-bold fs-5" style={{ color: "var(--danger-600, #dc3545)" }}>
                                KES {currency(totalOwed)}
                              </div>
                            </div>
                          </div>

                          <div className="table-responsive border-top">
                            <table className="table table-sm mb-0">
                              <thead>
                                <tr>
                                  <th>Term</th>
                                  <th>Class</th>
                                  <th className="text-end">Due</th>
                                  <th className="text-end">Paid</th>
                                  <th className="text-end">Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selected.invoices.map((inv) => (
                                  <tr key={inv.id}>
                                    <td>{inv.term_label}</td>
                                    <td>{inv.grade_level_name}</td>
                                    <td className="text-end">KES {currency(inv.amount_due)}</td>
                                    <td className="text-end">KES {currency(inv.amount_paid)}</td>
                                    <td className="text-end fw-bold">KES {currency(inv.balance)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="p-3 border-top bg-white text-end">
                            <button
                              type="button"
                              className="btn btn-success"
                              onClick={() => openBalancePaymentPanel(selected, totalOwed)}
                            >
                              <i className="bi bi-cash-coin me-1"></i>
                              Pay Balance
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
            </div>
          </div>

          {/* ================= STEP 2: PAYMENT PANEL (MODAL) ================= */}
          {payingBalance && (
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
                  <form onSubmit={requestConfirmation}>
                    <div className="modal-body">
                      <div
                        className="d-flex justify-content-between mb-3 p-2 rounded-2"
                        style={{ background: "var(--surface-100, #f8f9fa)" }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{payingBalance.student_name}</div>
                          <div className="text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                            {payingBalance.admission_no} · All outstanding terms
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="text-muted-soft" style={{ fontSize: "var(--fs-xs)" }}>
                            Balance due
                          </div>
                          <div className="fw-bold" style={{ color: "var(--danger-600, #dc3545)" }}>
                            KES {currency(activeBalanceDue)}
                          </div>
                        </div>
                      </div>

                      {paymentError && (
                        <div className="alert alert-danger py-2" style={{ fontSize: "var(--fs-sm)" }}>
                          {paymentError}
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="form-label">Amount Received (KES)</label>
                        <input
                          type="number"
                          className="form-control"
                          required
                          min="0.01"
                          step="0.01"
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
                          <div className="form-text-hint">
                            Leave as-is to clear everything owed, or edit for a partial payment.
                          </div>
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

                      <div className="alert alert-light border py-2 mt-3 mb-0" style={{ fontSize: "var(--fs-sm)" }}>
                        You are recording <strong>KES {currency(amountNumber)}</strong> from{" "}
                        <strong>{payingBalance.student_name}</strong> ({payingBalance.admission_no}) via{" "}
                        <strong>{METHOD_LABEL[paymentDraft.method]}</strong>. Applied to the oldest term first.
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-outline-secondary" onClick={closePaymentPanel}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={recording}>
                        <i className="bi bi-check2-circle me-1"></i>
                        Confirm Payment
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2b: VERIFY TRANSACTION (BANK-STYLE POPUP) ================= */}
          {payingBalance && showConfirm && (
            <div
              className="modal fade show d-block"
              tabIndex="-1"
              role="dialog"
              aria-modal="true"
              style={{ backgroundColor: "rgba(15,23,42,0.8)", zIndex: 1080 }}
            >
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content" style={{ border: "3px solid #f59e0b", overflow: "hidden" }}>
                  <div className="modal-header" style={{ background: "#fffbeb" }}>
                    <h6 className="modal-title mb-0" style={{ fontWeight: 700, color: "#92400e" }}>
                      <i className="bi bi-shield-check me-2"></i>
                      Review Transaction
                    </h6>
                  </div>

                  <div className="modal-body">
                    <div className="text-center text-muted-soft" style={{ fontSize: "var(--fs-sm)" }}>
                      Please verify the amount received before proceeding
                    </div>

                    {/* Highlighted amount */}
                    <div
                      className="text-center my-3 py-3 rounded-3"
                      style={{
                        background: "#fef3c7",
                        border: "2px dashed #f59e0b",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "var(--fs-xs)",
                          fontWeight: 700,
                          color: "#92400e",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        Amount Received
                      </div>
                      <div style={{ fontSize: "2.4rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
                        KES {currency(amountNumber)}
                      </div>
                    </div>

                    {/* Transaction details */}
                    <div className="border rounded-3 p-3" style={{ fontSize: "var(--fs-sm)" }}>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted-soft">Student</span>
                        <strong>{payingBalance.student_name}</strong>
                      </div>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted-soft">Admission No</span>
                        <strong>{payingBalance.admission_no}</strong>
                      </div>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted-soft">Payment Method</span>
                        <strong>{METHOD_LABEL[paymentDraft.method]}</strong>
                      </div>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted-soft">Reference</span>
                        <strong>{paymentDraft.reference || "-"}</strong>
                      </div>
                      <hr className="my-2" />
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted-soft">Balance Before</span>
                        <strong>KES {currency(activeBalanceDue)}</strong>
                      </div>
                      <div className="d-flex justify-content-between">
                        <span className="text-muted-soft">
                          {balanceAfterPayment < 0 ? "Credit After Payment" : "Balance After"}
                        </span>
                        <strong
                          style={{
                            color:
                              balanceAfterPayment > 0
                                ? "#b91c1c"
                                : balanceAfterPayment < 0
                                ? "#166534"
                                : "#0f172a",
                          }}
                        >
                          {balanceAfterPayment === 0
                            ? "KES 0 (Fully paid)"
                            : `KES ${currency(Math.abs(balanceAfterPayment))}`}
                        </strong>
                      </div>
                    </div>

                    {excessOverBalance > 0 && (
                      <div className="mt-2 text-success" style={{ fontSize: "var(--fs-sm)" }}>
                        <i className="bi bi-info-circle me-1"></i>
                        KES {currency(excessOverBalance)} above the balance will be saved as credit.
                      </div>
                    )}
                    {amountNumber < activeBalanceDue && (
                      <div className="mt-2" style={{ fontSize: "var(--fs-sm)", color: "#b45309" }}>
                        <i className="bi bi-info-circle me-1"></i>
                        Partial payment: KES {currency(activeBalanceDue - amountNumber)} will remain unpaid.
                      </div>
                    )}

                    {/* Verification checkbox */}
                    <div
                      className="form-check mt-3 p-2 ps-5 rounded-2"
                      style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
                    >
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="confirmAmountVerified"
                        checked={confirmChecked}
                        disabled={recording}
                        onChange={(e) => setConfirmChecked(e.target.checked)}
                      />
                      <label
                        className="form-check-label"
                        htmlFor="confirmAmountVerified"
                        style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "#b91c1c" }}
                      >
                        I have verified that KES {currency(amountNumber)} was received (cash count, M-Pesa
                        message or bank slip).
                      </label>
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={cancelConfirmation}
                      disabled={recording}
                    >
                      <i className="bi bi-arrow-left me-1"></i>
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={submitPayment}
                      disabled={!confirmChecked || recording}
                    >
                      {recording ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Processing...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check2-circle me-1"></i>
                          Confirm &amp; Record
                        </>
                      )}
                    </button>
                  </div>
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
                      <div className="col-6">
                        <span className="text-muted-soft">Receipt No.</span>
                      </div>
                      <div className="col-6 fw-bold">{receipt.receipt_no}</div>

                      <div className="col-6">
                        <span className="text-muted-soft">Student</span>
                      </div>
                      <div className="col-6">
                        {receipt.student_name} ({receipt.admission_no})
                      </div>

                      <div className="col-6">
                        <span className="text-muted-soft">Current Class</span>
                      </div>
                      <div className="col-6">{receipt.classroom || "-"}</div>

                      <div className="col-6">
                        <span className="text-muted-soft">Term</span>
                      </div>
                      <div className="col-6">{receipt.term}</div>

                      <div className="col-6">
                        <span className="text-muted-soft">Amount Paid</span>
                      </div>
                      <div className="col-6 fw-bold" style={{ color: "var(--success-600, #198754)" }}>
                        KES {currency(receipt.amount)}
                      </div>

                      {/* Balance remaining / prepaid credit after this payment */}
                      {(() => {
                        const bal = describeBalance(receipt.balance);
                        const color =
                          bal.tone === "owing"
                            ? "var(--danger-600, #dc3545)"
                            : bal.tone === "credit"
                            ? "var(--success-600, #198754)"
                            : undefined;
                        return (
                          <>
                            <div className="col-6">
                              <span className="text-muted-soft">{bal.label}</span>
                            </div>
                            <div className="col-6 fw-bold" style={{ color }}>
                              {bal.value}
                            </div>
                          </>
                        );
                      })()}

                      {receipt.allocations?.length > 1 && (
                        <div className="col-12 mt-2">
                          <div className="text-muted-soft mb-1">Applied to</div>
                          <table className="table table-sm mb-0">
                            <tbody>
                              {receipt.allocations.map((a, i) => (
                                <tr key={i}>
                                  <td>{a.term}</td>
                                  <td className="text-end">KES {currency(a.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="col-6">
                        <span className="text-muted-soft">Method</span>
                      </div>
                      <div className="col-6">
                        <span className={`badge ${METHOD_BADGE[receipt.method] || "badge-neutral"}`}>
                          <i className={`bi ${METHOD_ICON[receipt.method] || "bi-credit-card"} me-1`}></i>
                          {METHOD_LABEL[receipt.method] || receipt.method}
                        </span>
                      </div>

                      <div className="col-6">
                        <span className="text-muted-soft">Reference</span>
                      </div>
                      <div className="col-6">{receipt.reference || "-"}</div>

                      <div className="col-6">
                        <span className="text-muted-soft">Recorded By</span>
                      </div>
                      <div className="col-6">{receipt.recorded_by_name || "-"}</div>

                      <div className="col-6">
                        <span className="text-muted-soft">Date</span>
                      </div>
                      <div className="col-6">{new Date(receipt.paid_at).toLocaleString("en-KE")}</div>
                    </div>

                    {receipt.excess > 0 && (
                      <div className="alert alert-success mt-3 mb-0 py-2" style={{ fontSize: "var(--fs-sm)" }}>
                        <i className="bi bi-piggy-bank me-1"></i>
                        KES {currency(receipt.excess)} was paid above the balance and has been carried forward
                        as credit toward the student's next invoice.
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
                      className="btn btn-primary mt-3 ms-2"
                      onClick={() => handlePrintPaymentReceipt({ id: receipt.payment_id })}
                      disabled={printingReceiptId === receipt.payment_id}
                    >
                      {printingReceiptId === receipt.payment_id ? (
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      ) : (
                        <i className="bi bi-printer me-2"></i>
                      )}
                      Print Receipt
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
        </>
      )}

      {activeTab === "payments" && (
        <>
          {/* ================= PAYMENTS TABLE (filters live inside, one compact row) ================= */}
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

            {/* ---- Compact single-row filter toolbar (search first) ---- */}
            <div
              className="d-flex flex-nowrap align-items-center gap-2 px-3 py-2 border-bottom"
              style={{ overflowX: "auto", fontSize: "var(--fs-xs)" }}
            >
              {/* Search first */}
              <div className="input-group input-group-sm" style={{ minWidth: 220, width: 220, flex: "0 0 auto" }}>
                <span className="input-group-text bg-white px-2">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  className="form-control"
                  placeholder="Search student, admission no, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="form-select form-select-sm"
                style={{ minWidth: 92, width: 92, flex: "0 0 auto" }}
                title="Academic Year"
                value={filters.invoice__enrollment__academic_year}
                onChange={(e) => updateFilter("invoice__enrollment__academic_year", e.target.value)}
              >
                <option value="">Year</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.year}
                  </option>
                ))}
              </select>

              <select
                className="form-select form-select-sm"
                style={{ minWidth: 90, width: 90, flex: "0 0 auto" }}
                title="Grade"
                value={filters.invoice__enrollment__classroom__grade_level}
                onChange={(e) => updateFilter("invoice__enrollment__classroom__grade_level", e.target.value)}
              >
                <option value="">Grade</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>

              <select
                className="form-select form-select-sm"
                style={{ minWidth: 90, width: 90, flex: "0 0 auto" }}
                title="Stream"
                value={filters.invoice__enrollment__classroom__stream}
                onChange={(e) => updateFilter("invoice__enrollment__classroom__stream", e.target.value)}
              >
                <option value="">Stream</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                className="form-select form-select-sm"
                style={{ minWidth: 90, width: 90, flex: "0 0 auto" }}
                title="Term"
                value={filters.invoice__fee_structure__term}
                onChange={(e) => updateFilter("invoice__fee_structure__term", e.target.value)}
              >
                <option value="">Term</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.term_number ? `Term ${t.term_number}` : `Term #${t.id}`}
                  </option>
                ))}
              </select>

              <select
                className="form-select form-select-sm"
                style={{ minWidth: 96, width: 96, flex: "0 0 auto" }}
                title="Method"
                value={filters.method}
                onChange={(e) => updateFilter("method", e.target.value)}
              >
                <option value="">Method</option>
                <option value="MPESA">M-Pesa</option>
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
              </select>

              <input
                type="date"
                className="form-control form-control-sm"
                style={{ minWidth: 128, width: 128, flex: "0 0 auto" }}
                title="From date"
                value={filters.date_from}
                max={filters.date_to || undefined}
                onChange={(e) => updateFilter("date_from", e.target.value)}
              />
              <span className="text-muted-soft" style={{ flex: "0 0 auto" }}>
                &rarr;
              </span>
              <input
                type="date"
                className="form-control form-control-sm"
                style={{ minWidth: 128, width: 128, flex: "0 0 auto" }}
                title="To date"
                value={filters.date_to}
                min={filters.date_from || undefined}
                onChange={(e) => updateFilter("date_to", e.target.value)}
              />

              {hasActiveFilters && (
                <button
                  className="btn btn-sm btn-outline-secondary"
                  style={{ flex: "0 0 auto" }}
                  onClick={clearFilters}
                  type="button"
                  title="Clear filters"
                >
                  <i className="bi bi-arrow-counterclockwise"></i>
                </button>
              )}

              <span className="ms-auto d-flex gap-2" style={{ flex: "0 0 auto" }}>
                <button
                  className="btn btn-sm btn-success"
                  onClick={downloadExcel}
                  disabled={exportingExcel}
                  type="button"
                  title="Download Excel"
                >
                  {exportingExcel ? (
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  ) : (
                    <>
                      <i className="bi bi-file-earmark-excel me-1"></i>Excel
                    </>
                  )}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={downloadPdf}
                  disabled={exportingPdf}
                  type="button"
                  title="Download PDF"
                >
                  {exportingPdf ? (
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                  ) : (
                    <>
                      <i className="bi bi-file-earmark-pdf me-1"></i>PDF
                    </>
                  )}
                </button>
              </span>
            </div>

            {/* ---- Active filter chips (compact, only shown when set) ---- */}
            {hasActiveFilters && (
              <div className="d-flex flex-wrap gap-1 px-3 py-2 border-bottom" style={{ fontSize: "var(--fs-xs)" }}>
                {search && (
                  <span className="filter-chip">
                    Search: "{search}"
                    <button onClick={() => setSearch("")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
                {filters.invoice__enrollment__academic_year && (
                  <span className="filter-chip">
                    Year:{" "}
                    {
                      academicYears.find(
                        (y) => String(y.id) === String(filters.invoice__enrollment__academic_year)
                      )?.year
                    }
                    <button onClick={() => updateFilter("invoice__enrollment__academic_year", "")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
                {filters.invoice__enrollment__classroom__grade_level && (
                  <span className="filter-chip">
                    Grade:{" "}
                    {
                      gradeLevels.find(
                        (g) => String(g.id) === String(filters.invoice__enrollment__classroom__grade_level)
                      )?.name
                    }
                    <button onClick={() => updateFilter("invoice__enrollment__classroom__grade_level", "")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
                {filters.invoice__enrollment__classroom__stream && (
                  <span className="filter-chip">
                    Stream:{" "}
                    {
                      streams.find(
                        (s) => String(s.id) === String(filters.invoice__enrollment__classroom__stream)
                      )?.name
                    }
                    <button onClick={() => updateFilter("invoice__enrollment__classroom__stream", "")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
                {filters.invoice__fee_structure__term && (
                  <span className="filter-chip">
                    Term:{" "}
                    {
                      terms.find((t) => String(t.id) === String(filters.invoice__fee_structure__term))
                        ?.term_number
                    }
                    <button onClick={() => updateFilter("invoice__fee_structure__term", "")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
                {filters.method && (
                  <span className="filter-chip">
                    Method: {METHOD_LABEL[filters.method] || filters.method}
                    <button onClick={() => updateFilter("method", "")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
                {filters.date_from && (
                  <span className="filter-chip">
                    From: {filters.date_from}
                    <button onClick={() => updateFilter("date_from", "")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
                {filters.date_to && (
                  <span className="filter-chip">
                    To: {filters.date_to}
                    <button onClick={() => updateFilter("date_to", "")}>
                      <i className="bi bi-x"></i>
                    </button>
                  </span>
                )}
              </div>
            )}

            {listLoading ? (
              <TableSkeleton rows={5} columns={13} />
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
                  <table className="table table-hover table-sm mb-0" style={{ fontSize: "var(--fs-sm)" }}>
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
                        <th className="text-center">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                            {p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-KE") : "-"}
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
                          <td>
                            <span className="badge badge-neutral">{p.classroom}</span>
                          </td>
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
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              title="Print this receipt"
                              onClick={() => handlePrintPaymentReceipt(p)}
                              disabled={printingReceiptId === p.id}
                            >
                              {printingReceiptId === p.id ? (
                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                              ) : (
                                <i className="bi bi-printer"></i>
                              )}
                            </button>
                          </td>
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
        </>
      )}
    </div>
  );
}