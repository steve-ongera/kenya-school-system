import { useEffect, useRef, useState } from "react";
import { financeReportsApi, calendarApi, academicsApi } from "../../services/api";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import Pagination from "../../components/Pagination";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImage from "../../assets/junda_high_logo.png";

const formatKES = (n) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const num = (n) => Number(n || 0).toLocaleString("en-KE");

const STATUS_BADGE = {
  paid: { className: "badge-success", label: "Paid", icon: "bi-check-circle" },
  partial: { className: "badge-warning", label: "Partial", icon: "bi-hourglass-split" },
  unpaid: { className: "badge-danger", label: "Unpaid", icon: "bi-x-circle" },
};

// ---- PDF theme (same as the payment receipt) ----
const SCHOOL_NAME = "JUNDA HIGH SCHOOL";
const ADDRESS_LINE_1 = "P.O BOX 87073-80100, MOMBASA";
const ADDRESS_LINE_2 = "Email: jundahighschool83@gmail.com";
const MOTTO = "STRIVE TO EXCELL";
const NAVY = [31, 56, 100];
const GREY = [242, 242, 242];
const BORDER = [166, 166, 166];
const BLACK = [0, 0, 0];

// Shared helper: load the logo as a base64 data URL
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

// Receipt-style letterhead, drawn on every page.
const drawLetterhead = (doc, base64Logo, title, filterLine) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;

  if (base64Logo) {
    const props = doc.getImageProperties(base64Logo);
    const ratio = props.width / props.height || 1;
    const maxH = 16;
    const maxW = 30;
    let drawW = maxH * ratio;
    let drawH = maxH;
    if (drawW > maxW) {
      drawW = maxW;
      drawH = drawW / ratio;
    }
    doc.addImage(base64Logo, "PNG", marginX, 6 + (maxH - drawH) / 2, drawW, drawH);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(SCHOOL_NAME, pageWidth / 2, 12, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);
  doc.text(ADDRESS_LINE_1, pageWidth / 2, 17, { align: "center" });
  doc.text(ADDRESS_LINE_2, pageWidth / 2, 20.5, { align: "center" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text(MOTTO, pageWidth / 2, 24, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" })}`,
    pageWidth - marginX,
    8.5,
    { align: "right" }
  );

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(title, pageWidth / 2, 33, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BLACK);
  doc.text(filterLine, pageWidth / 2, 38, { align: "center", maxWidth: pageWidth - marginX * 2 });
};

// Footer with copyright + Masomo Portal credit + page numbers, on every page.
const drawFooters = (doc) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const year = new Date().getFullYear();
  const total = doc.internal.getNumberOfPages();
  const lineY = pageHeight - 14;

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.15);
    doc.line(marginX, lineY, pageWidth - marginX, lineY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...BLACK);
    doc.text(`© ${year} Junda High School Shanzu. All rights reserved.`, marginX, lineY + 4);

    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${total}`, pageWidth / 2, lineY + 4, { align: "center" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(90, 90, 90);
    doc.text("Powered by Masomo Portal (www.masomoportal.com)", pageWidth - marginX, lineY + 4, {
      align: "right",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.text(
      "This is an official finance report. Duplication is prohibited.",
      marginX,
      lineY + 7.5
    );
  }
};

// Print a jsPDF document through a hidden iframe (same PDF as the download).
const printPdfDoc = (doc) => {
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
    }, 60000);
  };

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        window.open(blobUrl, "_blank");
      } finally {
        cleanup();
      }
    }, 300);
  };

  document.body.appendChild(iframe);
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
  const [pdfBusy, setPdfBusy] = useState(null); // null | "download" | "print" | "classes"
  const initialLoad = useRef(true);
  const searchDebounce = useRef(null);

  // ---- Student Balances (master ledger) tab state ----
  const [balanceClassroomFilter, setBalanceClassroomFilter] = useState("");
  const [balanceStatusFilter, setBalanceStatusFilter] = useState("");
  const [balanceMinInput, setBalanceMinInput] = useState("");
  const [balanceMaxInput, setBalanceMaxInput] = useState("");
  const [balanceMin, setBalanceMin] = useState("");
  const [balanceMax, setBalanceMax] = useState("");
  const [balanceSearchInput, setBalanceSearchInput] = useState("");
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balancePage, setBalancePage] = useState(1);
  const [balanceItemsPerPage, setBalanceItemsPerPage] = useState(25);
  const [balanceResult, setBalanceResult] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(null);
  const balanceInitialLoad = useRef(true);
  const balanceRangeDebounce = useRef(null);
  const balanceSearchDebounce = useRef(null);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(searchDebounce.current);
  }, [searchInput]);

  useEffect(() => {
    if (balanceSearchDebounce.current) clearTimeout(balanceSearchDebounce.current);
    balanceSearchDebounce.current = setTimeout(() => {
      setBalanceSearch(balanceSearchInput);
      setBalancePage(1);
    }, 400);
    return () => clearTimeout(balanceSearchDebounce.current);
  }, [balanceSearchInput]);

  useEffect(() => {
    if (balanceRangeDebounce.current) clearTimeout(balanceRangeDebounce.current);
    balanceRangeDebounce.current = setTimeout(() => {
      setBalanceMin(balanceMinInput);
      setBalanceMax(balanceMaxInput);
      setBalancePage(1);
    }, 500);
    return () => clearTimeout(balanceRangeDebounce.current);
  }, [balanceMinInput, balanceMaxInput]);

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

  // ---- Student Balances fetch (independent of academic year/term - lifetime balance) ----
  useEffect(() => {
    if (activeTab !== "balances") return;
    setBalanceLoading(true);
    setBalanceError(null);
    financeReportsApi
      .studentBalances({
        classroom: balanceClassroomFilter || undefined,
        status: balanceStatusFilter || undefined,
        min_balance: balanceMin !== "" ? balanceMin : undefined,
        max_balance: balanceMax !== "" ? balanceMax : undefined,
        search: balanceSearch || undefined,
        page: balancePage,
        page_size: balanceItemsPerPage,
      })
      .then(({ data: res }) => setBalanceResult(res))
      .catch(() => setBalanceError("Could not load student balances."))
      .finally(() => {
        setBalanceLoading(false);
        balanceInitialLoad.current = false;
      });
  }, [
    activeTab,
    balanceClassroomFilter,
    balanceStatusFilter,
    balanceMin,
    balanceMax,
    balanceSearch,
    balancePage,
    balanceItemsPerPage,
  ]);

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

  // ---- Balances tab derived state ----
  const balanceRows = balanceResult?.results || [];
  const balanceCount = balanceResult?.count ?? 0;
  const balanceTotalPages = Math.max(1, Math.ceil(balanceCount / balanceItemsPerPage));
  const balanceSummary = balanceResult?.summary || { total_students: 0, total_balance: 0 };

  const handleBalancePageChange = (newPage) => {
    if (newPage < 1 || newPage > balanceTotalPages) return;
    setBalancePage(newPage);
  };

  const clearBalanceFilters = () => {
    setBalanceSearchInput("");
    setBalanceSearch("");
    setBalanceClassroomFilter("");
    setBalanceStatusFilter("");
    setBalanceMinInput("");
    setBalanceMaxInput("");
    setBalanceMin("");
    setBalanceMax("");
    setBalancePage(1);
  };

  const hasActiveBalanceFilters =
    balanceSearchInput || balanceClassroomFilter || balanceStatusFilter || balanceMinInput || balanceMaxInput;

  // ---------------------------------------------------------------------
  // PDF BUILDER - one portrait A4 layout used by BOTH tabs, and by BOTH
  // the download and the print button (so they are always identical).
  // ---------------------------------------------------------------------
  const buildListPdf = async ({ title, filterLine, head, body, foot, columnStyles }) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const base64Logo = await getImageBase64(logoImage);

    autoTable(doc, {
      startY: 42,
      head: [head],
      body,
      foot: [foot],
      showFoot: "lastPage",
      theme: "grid",
      margin: { top: 42, left: marginX, right: marginX, bottom: 20 },
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.2,
        overflow: "linebreak",
        lineColor: BORDER,
        lineWidth: 0.15,
        textColor: BLACK,
        valign: "middle",
      },
      headStyles: {
        fillColor: NAVY,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.2,
        lineColor: NAVY,
      },
      footStyles: {
        fillColor: GREY,
        textColor: NAVY,
        fontStyle: "bold",
        fontSize: 7.2,
      },
      alternateRowStyles: { fillColor: GREY },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === head.length - 1) {
          const val = String(data.cell.raw).toLowerCase();
          if (val === "paid") data.cell.styles.textColor = [22, 163, 74];
          else if (val === "partial") data.cell.styles.textColor = [217, 119, 6];
          else if (val === "unpaid") data.cell.styles.textColor = [220, 38, 38];
        }
      },
      didDrawPage: () => {
        drawLetterhead(doc, base64Logo, title, filterLine);
      },
    });

    // Signature block (moves to a new page if there is no room)
    let finalY = doc.lastAutoTable.finalY + 12;
    if (finalY > pageHeight - 38) {
      doc.addPage();
      drawLetterhead(doc, base64Logo, title, filterLine);
      finalY = 50;
    }

    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BLACK);
    doc.text("Finance Officer's Signature:", marginX, finalY);
    doc.line(marginX, finalY + 8, pageWidth / 2 - 6, finalY + 8);
    doc.text("Principal's Signature:", pageWidth / 2 + 6, finalY);
    doc.line(pageWidth / 2 + 6, finalY + 8, pageWidth - marginX, finalY + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text("Sign & Official Stamp", marginX, finalY + 12);
    doc.text("Sign & Official Stamp", pageWidth / 2 + 6, finalY + 12);

    drawFooters(doc);
    return doc;
  };

  // ---- Invoices report ----
  const buildInvoicesPdf = async () => {
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

    const currentYearObj = academicYears.find((ay) => ay.id === selectedYear);
    const yearLabel = currentYearObj ? currentYearObj.year : "All Years";
    const termObj = terms.find((t) => String(t.id) === String(termFilter));
    const termLabel = termObj ? (termObj.term_number ? `Term ${termObj.term_number}` : `Term ${termObj.id}`) : "All Terms";
    const classObj = classrooms.find((c) => String(c.id) === String(classroomFilter));
    const classLabel = classObj ? `${classObj.grade_level_name} ${classObj.stream_name || ""}`.trim() : "All Classes";
    const statusLabel = statusFilter ? statusFilter.toUpperCase() : "ALL STATUSES";

    const totals = allRows.reduce(
      (acc, inv) => {
        acc.due += Number(inv.due || 0);
        acc.paid += Number(inv.paid || 0);
        acc.balance += Number(inv.balance || 0);
        return acc;
      },
      { due: 0, paid: 0, balance: 0 }
    );

    const doc = await buildListPdf({
      title: "DETAILED FINANCE REPORT",
      filterLine: `Year: ${yearLabel}  |  Class: ${classLabel}  |  Term: ${termLabel}  |  Status: ${statusLabel}  |  Records: ${totalCount}`,
      head: ["Adm No", "Student Name", "Class", "Term", "Due (KES)", "Paid (KES)", "Balance (KES)", "Status"],
      body: allRows.map((inv) => [
        inv.admission_no,
        inv.student_name,
        inv.classroom,
        inv.term,
        num(inv.due),
        num(inv.paid),
        num(inv.balance),
        STATUS_BADGE[inv.status]?.label || inv.status,
      ]),
      foot: ["", "", "", "Totals", num(totals.due), num(totals.paid), num(totals.balance), ""],
      // widths add up to 190mm (A4 portrait minus 10mm margins)
      columnStyles: {
        0: { cellWidth: 18, halign: "left" },
        1: { cellWidth: 44, halign: "left" },
        2: { cellWidth: 24, halign: "left" },
        3: { cellWidth: 14, halign: "center" },
        4: { cellWidth: 24, halign: "right" },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 24, halign: "right" },
        7: { cellWidth: 18, halign: "center" },
      },
    });

    return { doc, filename: `Masomo_Finance_Report_${yearLabel}.pdf` };
  };

  // ---- Student balances report ----
  const buildBalancesPdf = async () => {
    const { data: fullRes } = await financeReportsApi.studentBalances({
      classroom: balanceClassroomFilter || undefined,
      status: balanceStatusFilter || undefined,
      min_balance: balanceMin !== "" ? balanceMin : undefined,
      max_balance: balanceMax !== "" ? balanceMax : undefined,
      search: balanceSearch || undefined,
      page: 1,
      page_size: 10000,
    });

    const allRows = fullRes?.results || [];
    const totalCount = fullRes?.count ?? allRows.length;

    const classObj = classrooms.find((c) => String(c.id) === String(balanceClassroomFilter));
    const classLabel = classObj ? `${classObj.grade_level_name} ${classObj.stream_name || ""}`.trim() : "All Classes";
    const statusLabel = balanceStatusFilter ? balanceStatusFilter.toUpperCase() : "ALL STATUSES";
    const rangeLabel =
      balanceMin || balanceMax ? `KES ${balanceMin || "0"} - ${balanceMax || "∞"}` : "No range filter";

    const totals = allRows.reduce(
      (acc, r) => {
        acc.due += Number(r.total_due || 0);
        acc.paid += Number(r.total_paid || 0);
        acc.balance += Number(r.balance || 0);
        return acc;
      },
      { due: 0, paid: 0, balance: 0 }
    );

    const doc = await buildListPdf({
      title: "STUDENT FEE BALANCES - MASTER LEDGER",
      filterLine: `Class: ${classLabel}  |  Status: ${statusLabel}  |  Balance Range: ${rangeLabel}  |  Students: ${totalCount}`,
      head: ["Adm No", "Student Name", "Class", "Curriculum", "Total Due", "Total Paid", "Balance", "Status"],
      body: allRows.map((r) => [
        r.admission_no,
        r.student_name,
        r.classroom,
        r.curriculum_type,
        num(r.total_due),
        num(r.total_paid),
        num(r.balance),
        STATUS_BADGE[r.status]?.label || r.status,
      ]),
      foot: ["", "", "", "Totals", num(totals.due), num(totals.paid), num(totals.balance), ""],
      // widths add up to 190mm
      columnStyles: {
        0: { cellWidth: 18, halign: "left" },
        1: { cellWidth: 42, halign: "left" },
        2: { cellWidth: 24, halign: "left" },
        3: { cellWidth: 20, halign: "left" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 20, halign: "center" },
      },
    });

    return { doc, filename: `Masomo_Student_Balances_${new Date().toISOString().slice(0, 10)}.pdf` };
  };

  // ---- ALL students' balances, grouped by class - every class starts on a new page ----
  // Independent of the on-screen filters: it always includes every student.
  const buildBalancesByClassPdf = async () => {
    const { data: fullRes } = await financeReportsApi.studentBalances({
      page: 1,
      page_size: 10000,
    });
    const allRows = fullRes?.results || [];
    if (!allRows.length) return null;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const base64Logo = await getImageBase64(logoImage);

    // Year shown after the class name, e.g. "Form 3 Blue 2026"
    const yearObj = academicYears.find((ay) => ay.is_current) || academicYears.find((ay) => ay.id === selectedYear);
    const yearLabel = yearObj ? String(yearObj.year) : "";

    // Group students by class
    const UNASSIGNED = "Unassigned";
    const groups = new Map();
    allRows.forEach((r) => {
      const raw = r.classroom ? String(r.classroom).trim() : "";
      const key = raw && raw !== "-" ? raw : UNASSIGNED;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    // Natural order: Form 1 Blue, Form 1 Red, Form 2 ... (students without a class go last)
    const classKeys = [...groups.keys()].sort((a, b) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });

    classKeys.forEach((key, idx) => {
      const groupRows = groups.get(key);
      const classTitle =
        key !== UNASSIGNED && yearLabel && !key.includes(yearLabel) ? `${key} ${yearLabel}` : key;

      const totals = groupRows.reduce(
        (acc, r) => {
          acc.due += Number(r.total_due || 0);
          acc.paid += Number(r.total_paid || 0);
          acc.balance += Number(r.balance || 0);
          return acc;
        },
        { due: 0, paid: 0, balance: 0 }
      );

      const title = `STUDENT FEE BALANCES - ${classTitle.toUpperCase()}`;
      const filterLine = `Class: ${classTitle}  |  Students: ${groupRows.length}  |  Total Outstanding: ${formatKES(totals.balance)}`;

      // every class starts on a fresh page
      if (idx > 0) doc.addPage();

      autoTable(doc, {
        startY: 42,
        head: [["Adm No", "Student Name", "Class", "Curriculum", "Total Due", "Total Paid", "Balance", "Status"]],
        body: groupRows.map((r) => [
          r.admission_no,
          r.student_name,
          r.classroom,
          r.curriculum_type,
          num(r.total_due),
          num(r.total_paid),
          num(r.balance),
          STATUS_BADGE[r.status]?.label || r.status,
        ]),
        foot: [["", "", "", "Totals", num(totals.due), num(totals.paid), num(totals.balance), ""]],
        showFoot: "lastPage",
        theme: "grid",
        margin: { top: 42, left: marginX, right: marginX, bottom: 20 },
        styles: {
          font: "helvetica",
          fontSize: 7,
          cellPadding: 1.2,
          overflow: "linebreak",
          lineColor: BORDER,
          lineWidth: 0.15,
          textColor: BLACK,
          valign: "middle",
        },
        headStyles: {
          fillColor: NAVY,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7.2,
          lineColor: NAVY,
        },
        footStyles: {
          fillColor: GREY,
          textColor: NAVY,
          fontStyle: "bold",
          fontSize: 7.2,
        },
        alternateRowStyles: { fillColor: GREY },
        // widths add up to 190mm
        columnStyles: {
          0: { cellWidth: 18, halign: "left" },
          1: { cellWidth: 42, halign: "left" },
          2: { cellWidth: 24, halign: "left" },
          3: { cellWidth: 20, halign: "left" },
          4: { cellWidth: 22, halign: "right" },
          5: { cellWidth: 22, halign: "right" },
          6: { cellWidth: 22, halign: "right" },
          7: { cellWidth: 20, halign: "center" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 7) {
            const val = String(data.cell.raw).toLowerCase();
            if (val === "paid") data.cell.styles.textColor = [22, 163, 74];
            else if (val === "partial") data.cell.styles.textColor = [217, 119, 6];
            else if (val === "unpaid") data.cell.styles.textColor = [220, 38, 38];
          }
        },
        didDrawPage: () => {
          drawLetterhead(doc, base64Logo, title, filterLine);
        },
      });

      // Signature block at the end of each class (moves to a new page if there is no room)
      let finalY = doc.lastAutoTable.finalY + 12;
      if (finalY > pageHeight - 38) {
        doc.addPage();
        drawLetterhead(doc, base64Logo, title, filterLine);
        finalY = 50;
      }

      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.25);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLACK);
      doc.text("Finance Officer's Signature:", marginX, finalY);
      doc.line(marginX, finalY + 8, pageWidth / 2 - 6, finalY + 8);
      doc.text("Principal's Signature:", pageWidth / 2 + 6, finalY);
      doc.line(pageWidth / 2 + 6, finalY + 8, pageWidth - marginX, finalY + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 100);
      doc.text("Sign & Official Stamp", marginX, finalY + 12);
      doc.text("Sign & Official Stamp", pageWidth / 2 + 6, finalY + 12);
    });

    drawFooters(doc);
    return {
      doc,
      filename: `Masomo_Student_Balances_By_Class_${new Date().toISOString().slice(0, 10)}.pdf`,
    };
  };

  // ---- Download / Print handler used by the buttons (works for both tabs) ----
  const handleExport = async (mode) => {
    const onBalances = activeTab === "balances";
    try {
      setPdfBusy(mode);
      const { doc, filename } = onBalances ? await buildBalancesPdf() : await buildInvoicesPdf();
      if (mode === "print") printPdfDoc(doc);
      else doc.save(filename);
    } catch (err) {
      const msg =
        mode === "print"
          ? "Could not prepare the report for printing."
          : "Could not generate the report PDF.";
      if (onBalances) setBalanceError(msg);
      else setError(msg);
    } finally {
      setPdfBusy(null);
    }
  };

  // ---- Download every student's balance, one class per page ----
  const handleDownloadByClass = async () => {
    try {
      setPdfBusy("classes");
      const built = await buildBalancesByClassPdf();
      if (!built) {
        setBalanceError("There are no student balances to download yet.");
        return;
      }
      built.doc.save(built.filename);
    } catch (err) {
      setBalanceError("Could not generate the class-by-class balances PDF.");
    } finally {
      setPdfBusy(null);
    }
  };

  // ---- Print a single student's balance statement ----
  // Same letterhead + footer as the PDFs.
  const handlePrintStudentBalance = async (student) => {
    const badge = STATUS_BADGE[student.status] || STATUS_BADGE.unpaid;
    const generatedOn = new Date().toLocaleDateString("en-KE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const year = new Date().getFullYear();

    const base64Logo = await getImageBase64(logoImage);
    const logoTag = base64Logo
      ? `<img src="${base64Logo}" alt="Junda High School Shanzu" class="logo" />`
      : `<div class="logo"></div>`;

    const statusClass =
      student.status === "paid"
        ? "status-paid"
        : student.status === "partial"
        ? "status-partial"
        : "status-unpaid";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fee Balance Statement - ${student.admission_no}</title>
          <style>
            * { box-sizing: border-box; font-family: Helvetica, Arial, sans-serif; }
            @page { size: A4 portrait; margin: 12mm; }
            html, body { margin: 0; padding: 0; color: #000; background: #fff; }
            body { padding: 16px 20px; }

            .header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              padding-bottom: 8px;
              border-bottom: 2px solid #1f3864;
            }
            .logo { width: 60px; height: 60px; object-fit: contain; }
            .header-center { flex: 1; text-align: center; }
            .school-name { font-size: 22px; font-weight: bold; margin: 0; color: #1f3864; }
            .addr { font-size: 10px; margin: 3px 0 0; color: #000; }
            .motto { font-size: 10px; margin: 3px 0 0; color: #6e6e6e; font-style: italic; }
            .meta { width: 90px; font-size: 9px; color: #6e6e6e; text-align: right; }

            .title-block { margin: 18px 0 12px; text-align: center; }
            .title-block h2 {
              font-size: 14px;
              font-weight: bold;
              color: #1f3864;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .title-block p { margin: 3px 0 0; font-size: 10.5px; color: #6e6e6e; }

            table.info { width: 100%; border-collapse: collapse; margin-top: 6px; }
            table.info td {
              padding: 8px 12px;
              border: 1px solid #a6a6a6;
              font-size: 12px;
              text-align: left;
            }
            table.info th {
              padding: 8px 12px;
              border: 1px solid #a6a6a6;
              font-size: 12px;
              text-align: left;
              background: #f2f2f2;
              width: 42%;
              font-weight: 700;
            }
            .balance-row th, .balance-row td { font-size: 14px; font-weight: bold; }
            .status-paid { color: #16a34a; font-weight: 700; }
            .status-partial { color: #d97706; font-weight: 700; }
            .status-unpaid { color: #dc2626; font-weight: 700; }

            .sign-block { display: flex; justify-content: space-between; gap: 16px; margin-top: 60px; }
            .sign-line {
              flex: 1;
              border-top: 1px solid #000;
              padding-top: 6px;
              font-size: 10.5px;
              color: #6e6e6e;
              text-align: center;
            }
            .sign-role { font-weight: 700; color: #000; font-size: 11px; }

            .footer {
              margin-top: 34px;
              padding-top: 6px;
              border-top: 1px solid #000;
              font-size: 9px;
              color: #000;
            }
            .footer-row { display: flex; justify-content: space-between; }
            .footer-row .powered { font-style: italic; color: #5a5a5a; }
            .footer .note { margin-top: 3px; font-size: 8px; color: #5a5a5a; }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoTag}
            <div class="header-center">
              <p class="school-name">${SCHOOL_NAME}</p>
              <p class="addr">${ADDRESS_LINE_1}</p>
              <p class="addr">${ADDRESS_LINE_2}</p>
              <p class="motto">${MOTTO}</p>
            </div>
            <div class="meta">Generated<br />${generatedOn}</div>
          </div>

          <div class="title-block">
            <h2>Student Fee Balance Statement</h2>
            <p>All-time fee ledger for the student identified below.</p>
          </div>

          <table class="info">
            <tr><th>Admission No</th><td>${student.admission_no}</td></tr>
            <tr><th>Student Name</th><td>${student.student_name}</td></tr>
            <tr><th>Class</th><td>${student.classroom}</td></tr>
            <tr><th>Curriculum</th><td>${student.curriculum_type}</td></tr>
            <tr><th>Total Fees Due (All Time)</th><td>${formatKES(student.total_due)}</td></tr>
            <tr><th>Total Fees Paid (All Time)</th><td>${formatKES(student.total_paid)}</td></tr>
            <tr class="balance-row"><th>Outstanding Balance</th><td>${formatKES(student.balance)}</td></tr>
            <tr><th>Payment Status</th><td class="${statusClass}">${badge.label}</td></tr>
          </table>

          <div class="sign-block">
            <div class="sign-line">
              <div class="sign-role">Finance Officer</div>
              <div>Signature &amp; Official Stamp</div>
            </div>
            <div class="sign-line">
              <div class="sign-role">Parent / Guardian</div>
              <div>Acknowledgement &amp; Signature</div>
            </div>
            <div class="sign-line">
              <div class="sign-role">Principal</div>
              <div>Signature &amp; Official Stamp</div>
            </div>
          </div>

          <div class="footer">
            <div class="footer-row">
              <strong>© ${year} Junda High School Shanzu. All rights reserved.</strong>
              <span class="powered">Powered by Masomo Portal (www.masomoportal.com)</span>
            </div>
            <div class="note">This is an official fee balance statement. Duplication is prohibited.</div>
          </div>
        </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 500);
    };

    const frameDoc = iframe.contentWindow.document;
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        // ignore
      } finally {
        cleanup();
      }
    };

    if (iframe.contentWindow.document.readyState === "complete") {
      setTimeout(triggerPrint, 150);
    } else {
      iframe.onload = () => setTimeout(triggerPrint, 150);
    }
  };

  const showExportButtons =
    (activeTab === "invoices" && count > 0 && !loading) ||
    (activeTab === "balances" && balanceCount > 0 && !balanceLoading);

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
        {academicYears.length > 0 && activeTab !== "balances" && (
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

      {balanceError && activeTab === "balances" && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-circle me-2"></i>
          {balanceError}
          <button type="button" className="btn-close" onClick={() => setBalanceError(null)}></button>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", paddingBottom: "0.75rem" }}>
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-receipt me-2" style={{ color: "var(--blue-700)" }}></i>
              Detailed Report
            </span>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              {activeTab === "balances" && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success d-flex align-items-center gap-1"
                  onClick={handleDownloadByClass}
                  disabled={pdfBusy !== null}
                  title="Download every student's balance, grouped by class (each class starts on a new page)"
                  style={{ fontSize: "var(--fs-xs)" }}
                >
                  {pdfBusy === "classes" ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      Preparing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-files"></i> All Students by Class
                    </>
                  )}
                </button>
              )}
              {showExportButtons && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                    onClick={() => handleExport("print")}
                    disabled={pdfBusy !== null}
                    style={{ fontSize: "var(--fs-xs)" }}
                  >
                    {pdfBusy === "print" ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        Preparing...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-printer"></i> Print
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                    onClick={() => handleExport("download")}
                    disabled={pdfBusy !== null}
                    style={{ fontSize: "var(--fs-xs)" }}
                  >
                    {pdfBusy === "download" ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        Generating PDF...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-file-earmark-pdf"></i> Download PDF
                      </>
                    )}
                  </button>
                </>
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
            <li className="nav-item" role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "balances"}
                className={`nav-link ${activeTab === "balances" ? "active" : ""}`}
                onClick={() => setActiveTab("balances")}
              >
                <i className="bi bi-wallet2 me-1" style={{ color: "var(--blue-700)" }}></i>
                Student Balances
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

        {activeTab === "balances" && (
          <>
            <div className="table-wrap__header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
              <div className="d-flex flex-wrap gap-2 align-items-center" style={{ width: "100%" }}>
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
                    value={balanceSearchInput}
                    onChange={(e) => setBalanceSearchInput(e.target.value)}
                    style={{ paddingLeft: "2.4rem" }}
                  />
                </div>

                <select
                  className="form-select"
                  value={balanceClassroomFilter}
                  onChange={(e) => {
                    setBalanceClassroomFilter(e.target.value);
                    setBalancePage(1);
                  }}
                  style={{ width: "auto", minWidth: "160px" }}
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
                  value={balanceStatusFilter}
                  onChange={(e) => {
                    setBalanceStatusFilter(e.target.value);
                    setBalancePage(1);
                  }}
                  style={{ width: "auto", minWidth: "130px" }}
                >
                  <option value="">All statuses</option>
                  <option value="paid">Fully paid</option>
                  <option value="partial">Partial</option>
                  <option value="unpaid">Unpaid</option>
                </select>

                <div className="d-flex align-items-center gap-1">
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Min balance"
                    value={balanceMinInput}
                    onChange={(e) => setBalanceMinInput(e.target.value)}
                    style={{ width: "120px" }}
                  />
                  <span style={{ color: "var(--ink-400)" }}>–</span>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Max balance"
                    value={balanceMaxInput}
                    onChange={(e) => setBalanceMaxInput(e.target.value)}
                    style={{ width: "120px" }}
                  />
                </div>

                {hasActiveBalanceFilters && (
                  <button className="btn btn-sm btn-light" onClick={clearBalanceFilters}>
                    <i className="bi bi-x-lg"></i> Clear
                  </button>
                )}
              </div>

              {!balanceLoading && balanceCount > 0 && (
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                  <i className="bi bi-people me-1"></i>
                  {balanceSummary.total_students} student{balanceSummary.total_students === 1 ? "" : "s"} matching
                  {" · "}
                  <strong>{formatKES(balanceSummary.total_balance)}</strong> total outstanding
                </div>
              )}
            </div>

            {balanceLoading ? (
              <TableSkeleton rows={5} columns={9} />
            ) : balanceRows.length === 0 ? (
              <div className="empty-state">
                <i className="bi bi-inbox"></i>
                <h6>No students match these filters</h6>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Admission No</th>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Curriculum</th>
                      <th className="text-end">Total Due</th>
                      <th className="text-end">Total Paid</th>
                      <th className="text-end">Balance</th>
                      <th>Status</th>
                      <th className="text-center">Print</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceRows.map((s) => {
                      const badge = STATUS_BADGE[s.status] || STATUS_BADGE.unpaid;
                      return (
                        <tr key={s.id}>
                          <td>{s.admission_no}</td>
                          <td>{s.student_name}</td>
                          <td>{s.classroom}</td>
                          <td>{s.curriculum_type}</td>
                          <td className="text-end">{formatKES(s.total_due)}</td>
                          <td className="text-end">{formatKES(s.total_paid)}</td>
                          <td className="text-end">{formatKES(s.balance)}</td>
                          <td>
                            <span className={`badge ${badge.className}`}>{badge.label}</span>
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              title="Print this student's balance statement"
                              onClick={() => handlePrintStudentBalance(s)}
                            >
                              <i className="bi bi-printer"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!balanceLoading && balanceRows.length > 0 && (
              <Pagination
                currentPage={balancePage}
                totalPages={balanceTotalPages}
                onPageChange={handleBalancePageChange}
                itemsPerPage={balanceItemsPerPage}
                setItemsPerPage={setBalanceItemsPerPage}
                startIndex={(balancePage - 1) * balanceItemsPerPage}
                endIndex={Math.min(balancePage * balanceItemsPerPage, balanceCount)}
                totalItems={balanceCount}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}