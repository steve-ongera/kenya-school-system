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
  const [downloadingBalancePdf, setDownloadingBalancePdf] = useState(false);
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

  // Professional landscape PDF export with proper column balance, totals row and signature block
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

      const doc = new jsPDF("l", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

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

      const currentYearObj = academicYears.find((ay) => ay.id === selectedYear);
      const yearLabel = currentYearObj ? currentYearObj.year : "All Years";
      const termObj = terms.find((t) => String(t.id) === String(termFilter));
      const termLabel = termObj ? (termObj.term_number ? `Term ${termObj.term_number}` : `Term ${termObj.id}`) : "All Terms";
      const classObj = classrooms.find((c) => String(c.id) === String(classroomFilter));
      const classLabel = classObj ? `${classObj.grade_level_name} ${classObj.stream_name || ""}`.trim() : "All Classes";
      const statusLabel = statusFilter ? statusFilter.toUpperCase() : "ALL STATUSES";

      if (base64Logo) {
        doc.addImage(base64Logo, "PNG", 12, 10, 12, 12);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("Masomo School", base64Logo ? 28 : 12, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text("Detailed Finance Report", base64Logo ? 28 : 12, 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated ${new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" })}`,
        pageWidth - 12,
        16,
        { align: "right" }
      );

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(12, 26, pageWidth - 12, 26);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Year: ${yearLabel}   |   Class: ${classLabel}   |   Term: ${termLabel}   |   Status: ${statusLabel}   |   Records: ${totalCount}`,
        12,
        32
      );

      const tableColumn = ["Adm No", "Student Name", "Class", "Term", "Due (KES)", "Paid (KES)", "Balance (KES)", "Status"];
      const tableRows = allRows.map((inv) => [
        inv.admission_no,
        inv.student_name,
        inv.classroom,
        inv.term,
        Number(inv.due || 0).toLocaleString("en-KE"),
        Number(inv.paid || 0).toLocaleString("en-KE"),
        Number(inv.balance || 0).toLocaleString("en-KE"),
        STATUS_BADGE[inv.status]?.label || inv.status,
      ]);

      const totals = allRows.reduce(
        (acc, inv) => {
          acc.due += Number(inv.due || 0);
          acc.paid += Number(inv.paid || 0);
          acc.balance += Number(inv.balance || 0);
          return acc;
        },
        { due: 0, paid: 0, balance: 0 }
      );

      autoTable(doc, {
        startY: 37,
        head: [tableColumn],
        body: tableRows,
        foot: [[
          "",
          "",
          "",
          "Totals",
          totals.due.toLocaleString("en-KE"),
          totals.paid.toLocaleString("en-KE"),
          totals.balance.toLocaleString("en-KE"),
          "",
        ]],
        theme: "grid",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 2,
          halign: "left",
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          fontSize: 8,
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 1.8,
          valign: "middle",
          lineWidth: 0.1,
          lineColor: [226, 232, 240],
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 60, overflow: "ellipsize" },
          2: { cellWidth: 38 },
          3: { cellWidth: 18, halign: "center" },
          4: { cellWidth: 32, halign: "right" },
          5: { cellWidth: 32, halign: "right" },
          6: { cellWidth: 32, halign: "right" },
          7: { cellWidth: 24, halign: "center" },
        },
        margin: { left: 12, right: 12 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 7) {
            const val = String(data.cell.raw).toLowerCase();
            if (val === "paid") data.cell.styles.textColor = [22, 163, 74];
            else if (val === "partial") data.cell.styles.textColor = [217, 119, 6];
            else if (val === "unpaid") data.cell.styles.textColor = [220, 38, 38];
          }
        },
        didDrawPage: () => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
            pageWidth - 12,
            pageHeight - 6,
            { align: "right" }
          );
          doc.text("Masomo School — Finance Department", 12, pageHeight - 6);
        },
      });

      let finalY = doc.lastAutoTable.finalY + 14;
      if (finalY > pageHeight - 28) {
        doc.addPage();
        finalY = 24;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Principal's Signature:", 12, finalY);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.line(12, finalY + 10, 90, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", 12, finalY + 14);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("Finance Officer's Signature:", pageWidth - 90, finalY);
      doc.line(pageWidth - 90, finalY + 10, pageWidth - 12, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("Sign & Official Stamp", pageWidth - 90, finalY + 14);

      doc.save(`Masomo_Finance_Report_${yearLabel}.pdf`);
    } catch (err) {
      setError("Could not generate the finance report PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ---- Download the filtered Student Balances list as a landscape PDF ----
  const handleDownloadBalancesPDF = async () => {
    try {
      setDownloadingBalancePdf(true);
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

      const doc = new jsPDF("l", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

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

      const classObj = classrooms.find((c) => String(c.id) === String(balanceClassroomFilter));
      const classLabel = classObj ? `${classObj.grade_level_name} ${classObj.stream_name || ""}`.trim() : "All Classes";
      const statusLabel = balanceStatusFilter ? balanceStatusFilter.toUpperCase() : "ALL STATUSES";
      const rangeLabel =
        balanceMin || balanceMax
          ? `KES ${balanceMin || "0"} - ${balanceMax || "∞"}`
          : "No range filter";

      if (base64Logo) {
        doc.addImage(base64Logo, "PNG", 12, 10, 12, 12);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("Masomo School", base64Logo ? 28 : 12, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text("Student Fee Balances — Master Ledger", base64Logo ? 28 : 12, 22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated ${new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" })}`,
        pageWidth - 12,
        16,
        { align: "right" }
      );

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(12, 26, pageWidth - 12, 26);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Class: ${classLabel}   |   Status: ${statusLabel}   |   Balance Range: ${rangeLabel}   |   Students: ${totalCount}`,
        12,
        32
      );

      const tableColumn = ["Adm No", "Student Name", "Class", "Curriculum", "Total Due", "Total Paid", "Balance", "Status"];
      const tableRows = allRows.map((r) => [
        r.admission_no,
        r.student_name,
        r.classroom,
        r.curriculum_type,
        Number(r.total_due || 0).toLocaleString("en-KE"),
        Number(r.total_paid || 0).toLocaleString("en-KE"),
        Number(r.balance || 0).toLocaleString("en-KE"),
        STATUS_BADGE[r.status]?.label || r.status,
      ]);

      const totals = allRows.reduce(
        (acc, r) => {
          acc.due += Number(r.total_due || 0);
          acc.paid += Number(r.total_paid || 0);
          acc.balance += Number(r.balance || 0);
          return acc;
        },
        { due: 0, paid: 0, balance: 0 }
      );

      autoTable(doc, {
        startY: 37,
        head: [tableColumn],
        body: tableRows,
        foot: [[
          "",
          "",
          "",
          "Totals",
          totals.due.toLocaleString("en-KE"),
          totals.paid.toLocaleString("en-KE"),
          totals.balance.toLocaleString("en-KE"),
          "",
        ]],
        theme: "grid",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          cellPadding: 2,
          halign: "left",
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          fontSize: 8,
          cellPadding: 2,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
          cellPadding: 1.8,
          valign: "middle",
          lineWidth: 0.1,
          lineColor: [226, 232, 240],
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 62, overflow: "ellipsize" },
          2: { cellWidth: 40 },
          3: { cellWidth: 28, halign: "center" },
          4: { cellWidth: 30, halign: "right" },
          5: { cellWidth: 30, halign: "right" },
          6: { cellWidth: 30, halign: "right" },
          7: { cellWidth: 24, halign: "center" },
        },
        margin: { left: 12, right: 12 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 7) {
            const val = String(data.cell.raw).toLowerCase();
            if (val === "paid") data.cell.styles.textColor = [22, 163, 74];
            else if (val === "partial") data.cell.styles.textColor = [217, 119, 6];
            else if (val === "unpaid") data.cell.styles.textColor = [220, 38, 38];
          }
        },
        didDrawPage: () => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${doc.internal.getNumberOfPages()}`,
            pageWidth - 12,
            pageHeight - 6,
            { align: "right" }
          );
          doc.text("Masomo School — Finance Department", 12, pageHeight - 6);
        },
      });

      doc.save(`Masomo_Student_Balances_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setBalanceError("Could not generate the balances PDF.");
    } finally {
      setDownloadingBalancePdf(false);
    }
  };

  // ---- Print a single student's balance statement ----
  const handlePrintStudentBalance = (student) => {
    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) return;

    const badge = STATUS_BADGE[student.status] || STATUS_BADGE.unpaid;
    const generatedOn = new Date().toLocaleDateString("en-KE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fee Balance Statement - ${student.admission_no}</title>
          <style>
            * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
            body { padding: 40px; color: #0f172a; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 24px; }
            .school-name { font-size: 20px; font-weight: bold; margin: 0; }
            .subtitle { font-size: 13px; color: #475569; margin: 2px 0 0; }
            .meta { font-size: 11px; color: #64748b; text-align: right; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            td, th { padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px; text-align: left; }
            th { background: #f1f5f9; width: 40%; color: #334155; }
            .balance-row td { font-size: 16px; font-weight: bold; }
            .status-paid { color: #16a34a; }
            .status-partial { color: #d97706; }
            .status-unpaid { color: #dc2626; }
            .sign-block { display: flex; justify-content: space-between; margin-top: 60px; }
            .sign-line { border-top: 1px solid #94a3b8; width: 220px; padding-top: 6px; font-size: 11px; color: #64748b; text-align: center; }
            @media print { body { padding: 0 24px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <p class="school-name">Masomo School</p>
              <p class="subtitle">Student Fee Balance Statement</p>
            </div>
            <div class="meta">Generated ${generatedOn}</div>
          </div>

          <table>
            <tr><th>Admission No</th><td>${student.admission_no}</td></tr>
            <tr><th>Student Name</th><td>${student.student_name}</td></tr>
            <tr><th>Class</th><td>${student.classroom}</td></tr>
            <tr><th>Curriculum</th><td>${student.curriculum_type}</td></tr>
            <tr><th>Total Fees Due (All Time)</th><td>${formatKES(student.total_due)}</td></tr>
            <tr><th>Total Fees Paid (All Time)</th><td>${formatKES(student.total_paid)}</td></tr>
            <tr class="balance-row"><th>Outstanding Balance</th><td>${formatKES(student.balance)}</td></tr>
            <tr><th>Payment Status</th><td class="status-${student.status}">${badge.label}</td></tr>
          </table>

          <div class="sign-block">
            <div class="sign-line">Finance Officer's Signature</div>
            <div class="sign-line">Parent/Guardian Acknowledgement</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.onload = () => {
      win.print();
    };
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
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-file-earmark-pdf"></i> Download PDF Report
                    </>
                  )}
                </button>
              )}
              {activeTab === "balances" && balanceCount > 0 && !balanceLoading && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                  onClick={handleDownloadBalancesPDF}
                  disabled={downloadingBalancePdf}
                  style={{ fontSize: "var(--fs-xs)" }}
                >
                  {downloadingBalancePdf ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-file-earmark-pdf"></i> Download Filtered List
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