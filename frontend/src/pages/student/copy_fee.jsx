import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { financeApi, paymentsApi, profileApi } from "../../services/api";
import ReceiptCard from "../../components/Receiptcard";
import Breadcrumb from "../../components/Breadcrumb";
import TableSkeleton from "../../components/TableSkeleton";
import logoImage from "../../assets/junda_high_logo.png";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 20; // ~1 minute

// Printed on receipts and the fee statement
const SCHOOL_NAME = "Junda High School Shanzu";
const DOC_COPY_NOTE = "This is a computer-generated document copy.";

const currency = (v) => Number(v || 0).toLocaleString();

const METHOD_LABEL = {
  MPESA: "M-Pesa",
  BANK: "Bank",
  CASH: "Cash",
  CHEQUE: "Cheque",
};

// "Term 1 - 2026" -> sortable number (20261). null if the label isn't in that shape.
const termOrder = (inv) => {
  const m = /Term\s+(\d+)\s*-\s*(\d{4})/i.exec(inv.term_label || "");
  return m ? Number(m[2]) * 10 + Number(m[1]) : null;
};

// Brought-forward wording: positive = arrears, negative = credit from earlier terms
const bfText = (v) => (Number(v) < 0 ? `KES ${currency(Math.abs(Number(v)))} credit` : `KES ${currency(v)}`);

// A payment response may carry one payment (`payment`) or several (`payments`)
const paymentsFrom = (data) =>
  data.payments?.length ? data.payments : data.payment ? [data.payment] : [];

// Load an image URL as base64 (used for embedding the logo into print docs)
const getImageBase64 = (url) =>
  new Promise((resolve) => {
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

export default function StudentFees() {
  const [invoices, setInvoices] = useState([]);
  const [defaultPhone, setDefaultPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [feeStatus, setFeeStatus] = useState(null);

  // pay modal state (ONE general payment - the backend splits it across invoices, oldest term first)
  const [showPayModal, setShowPayModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [payError, setPayError] = useState("");
  const [payStatus, setPayStatus] = useState(""); // "", "SUBMITTING", "PENDING", "COMPLETED", "FAILED"
  const [paidPayments, setPaidPayments] = useState([]); // one row per invoice the payment was split into

  // receipt viewer state
  const [receipt, setReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);

  // fee statement download state
  const [downloadingStatement, setDownloadingStatement] = useState(false);

  // Returns the fresh list so callers can use it straight away
  const loadInvoices = async () => {
    setLoading(true);
    try {
      const { data } = await financeApi.invoices({ page_size: 200 });
      const list = (data.results ?? data).sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
      setInvoices(list);
      return list;
    } catch (error) {
      console.error("Failed to load invoices:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
    profileApi.me().then(({ data }) => setDefaultPhone(data.phone_number || ""));
    financeApi.status().then(({ data }) => setFeeStatus(data)).catch(() => {});
  }, []);

  // ---- Balance calculation --------------------------------------------
  // IMPORTANT: use term_charge (amount_due - brought_forward), NOT raw
  // amount_due, when summing across invoices. Each invoice's amount_due
  // already folds in every prior term's unpaid balance via
  // brought_forward (see Invoice.brought_forward / services.generate_invoice
  // on the backend). Summing amount_due directly re-adds the same arrears
  // once per later invoice and overstates the balance - term_charge is
  // each invoice's OWN fee for that term alone, so summing that avoids
  // double-counting. (Per-invoice display below still shows amount_due /
  // balance as-is, which is correct at the row level.)
  const totalDue = invoices.reduce((s, i) => s + Number(i.term_charge), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
  const netBalance = totalDue - totalPaid;
  const prepaidAmount = netBalance < 0 ? Math.abs(netBalance) : 0;

  // Oldest -> newest, for the statement and the "latest term" figures
  const chronological = [...invoices].sort((a, b) => {
    const ka = termOrder(a);
    const kb = termOrder(b);
    if (ka !== null && kb !== null && ka !== kb) return ka - kb;
    return new Date(a.issued_at) - new Date(b.issued_at);
  });
  const latestInvoice = chronological[chronological.length - 1] || null;
  // what was carried INTO the latest term from earlier terms (+ arrears, - credit)
  const latestBroughtForward = latestInvoice ? Number(latestInvoice.brought_forward) : 0;

  // ---- General payment (one button, backend splits across invoices) ----
  const openPayModal = () => {
    setPhone(defaultPhone);
    setAmount(netBalance > 0 ? String(Math.ceil(netBalance)) : "");
    setPayError("");
    setPayStatus("");
    setPaidPayments([]);
    setShowPayModal(true);
  };

  const closePayModal = () => {
    setShowPayModal(false);
    setPayStatus("");
    setPayError("");
    setPaidPayments([]);
  };

  // Called once the payment is confirmed: refresh invoices, then show which term(s) it landed on
  const finishPayment = async (payments) => {
    const list = await loadInvoices();
    const termByInvoice = Object.fromEntries(list.map((i) => [i.id, i.term_label]));
    setPaidPayments(payments.map((p) => ({ ...p, term_label: termByInvoice[p.invoice] || "-" })));
    setPayStatus("COMPLETED");
    // A single payment can open its receipt straight away; several are listed in the success screen
    if (payments.length === 1) await viewReceipt(payments[0].id);
  };

  const pollStatus = async (checkoutRequestId, triesLeft) => {
    if (triesLeft <= 0) {
      setPayStatus("FAILED");
      setPayError("We didn't get a confirmation in time. If you completed the M-Pesa prompt, your balance will update shortly - check back on this page.");
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const { data } = await paymentsApi.status(checkoutRequestId);
      if (data.status === "COMPLETED") {
        await finishPayment(paymentsFrom(data));
      } else if (data.status === "FAILED" || data.status === "CANCELLED") {
        setPayStatus("FAILED");
        setPayError(data.result_description || "Payment was not completed.");
      } else {
        pollStatus(checkoutRequestId, triesLeft - 1);
      }
    } catch {
      pollStatus(checkoutRequestId, triesLeft - 1);
    }
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    setPayError("");
    setPayStatus("SUBMITTING");
    try {
      // No invoice_id -> the backend treats this as a general payment
      // and splits it across invoices, oldest term first.
      const { data } = await paymentsApi.initiate({
        phone_number: phone,
        amount: Number(amount),
      });
      if (data.status === "COMPLETED") {
        await finishPayment(paymentsFrom(data));
      } else {
        setPayStatus("PENDING");
        pollStatus(data.checkout_request_id, POLL_MAX_TRIES);
      }
    } catch (err) {
      setPayStatus("FAILED");
      const detail = err.response?.data?.detail || err.response?.data;
      setPayError(typeof detail === "object" ? Object.values(detail).flat().join(" ") : (detail || "Could not start payment."));
    }
  };

  const viewReceipt = async (paymentId) => {
    setReceiptLoading(true);
    setShowReceiptModal(true);
    try {
      const { data } = await paymentsApi.receipt(paymentId);
      setReceipt(data);
    } catch (error) {
      console.error("Failed to load receipt:", error);
    } finally {
      setReceiptLoading(false);
    }
  };

  const closeReceiptModal = () => {
    setShowReceiptModal(false);
    setReceipt(null);
    setReceiptLoading(false);
  };

  // Get all payments from invoices
  const allPayments = invoices.flatMap((inv) =>
    (inv.payments || []).map((p) => ({ ...p, term_label: inv.term_label }))
  );

  // ---- Download the full fee statement (PDF) ----
  // One row per term: what the term cost, what was brought forward, what
  // was due in total, what was paid, and the balance carried to the next
  // term (negative = prepaid / credit).
  const handleDownloadStatement = async () => {
    if (!invoices.length) return;
    try {
      setDownloadingStatement(true);

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const M = 12;

      const base64Logo = await getImageBase64(logoImage);
      const today = new Date();
      const generatedOn = today.toLocaleDateString("en-KE", {
        year: "numeric", month: "long", day: "numeric",
      });

      const studentName = invoices[0]?.student_name || "-";
      const admissionNo = invoices[0]?.admission_no || "-";
      const firstTerm = chronological[0]?.term_label || "-";
      const lastTerm = latestInvoice?.term_label || "-";

      const gridStyles = { lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [51, 65, 85] };
      const labelCell = { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [71, 85, 105] };
      const RED = [220, 38, 38];
      const GREEN = [22, 163, 74];

      // --- Header ---
      if (base64Logo) doc.addImage(base64Logo, "PNG", M, 8, 12, 12);
      const textX = base64Logo ? M + 16 : M;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(SCHOOL_NAME, textX, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text("Fee Statement", textX, 19);
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, pageWidth - M, 14, { align: "right" });
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(M, 23, pageWidth - M, 23);

      // --- Student block ---
      autoTable(doc, {
        startY: 26,
        theme: "grid",
        body: [
          ["Student", studentName, "Admission No", admissionNo],
          ["Statement Date", generatedOn, "Terms Covered", firstTerm === lastTerm ? firstTerm : `${firstTerm} to ${lastTerm}`],
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

      // --- Summary strip ---
      const balanceLabel = netBalance > 0 ? "Balance Owing" : netBalance < 0 ? "Prepaid (Credit)" : "Balance";
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 3,
        theme: "grid",
        head: [["Total Fees Charged", "Total Paid", "Brought Forward (latest term)", balanceLabel]],
        body: [[
          `KES ${currency(totalDue)}`,
          `KES ${currency(totalPaid)}`,
          bfText(latestBroughtForward),
          `KES ${currency(Math.abs(netBalance))}`,
        ]],
        styles: {
          fontSize: 9, cellPadding: 1.8, halign: "center", valign: "middle",
          fontStyle: "bold", ...gridStyles, textColor: [15, 23, 42],
        },
        headStyles: {
          fillColor: [241, 245, 249], textColor: [71, 85, 105],
          fontSize: 7, fontStyle: "bold", cellPadding: 1.4,
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          if (data.column.index === 2 && latestBroughtForward !== 0) {
            data.cell.styles.textColor = latestBroughtForward > 0 ? RED : GREEN;
          }
          if (data.column.index === 3) {
            data.cell.styles.textColor = netBalance > 0 ? RED : GREEN;
          }
        },
        margin: { left: M, right: M },
      });

      let y = doc.lastAutoTable.finalY + 5;
      const statusNote =
        netBalance > 0
          ? `Outstanding balance: KES ${currency(netBalance)}.`
          : netBalance < 0
            ? `Prepaid: KES ${currency(prepaidAmount)} paid in advance. It will be applied to your next term's fees.`
            : "Your account is fully settled.";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...(netBalance > 0 ? RED : GREEN));
      doc.text(statusNote, M, y);
      y += 5;

      // --- Statement by term ---
      const rowStatus = (bal) => (bal > 0 ? "Owing" : bal < 0 ? "Prepaid" : "Cleared");
      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Term", "Grade", "Term Fee", "Brought Fwd", "Total Due", "Paid", "Balance", "Status"]],
        body: chronological.map((inv) => [
          inv.term_label,
          inv.grade_level_name,
          currency(inv.term_charge),
          currency(inv.brought_forward),
          currency(inv.amount_due),
          currency(inv.amount_paid),
          currency(inv.balance),
          rowStatus(Number(inv.balance)),
        ]),
        foot: [[
          "Total", "", currency(totalDue), "-", "-", currency(totalPaid), currency(netBalance),
          rowStatus(netBalance),
        ]],
        showFoot: "lastPage",
        styles: { fontSize: 8, cellPadding: 1.8, overflow: "ellipsize", ...gridStyles },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 18 },
          2: { cellWidth: 24, halign: "right" },
          3: { cellWidth: 24, halign: "right" },
          4: { cellWidth: 24, halign: "right" },
          5: { cellWidth: 24, halign: "right" },
          6: { cellWidth: 24, halign: "right" },
          7: { cellWidth: 22, halign: "center" },
        },
        margin: { left: M, right: M },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const inv = chronological[data.row.index];
          if (!inv) return;
          const bf = Number(inv.brought_forward);
          const bal = Number(inv.balance);
          if (data.column.index === 3 && bf !== 0) {
            data.cell.styles.textColor = bf > 0 ? RED : GREEN;
          }
          if (data.column.index === 5) data.cell.styles.textColor = GREEN;
          if (data.column.index === 6 || data.column.index === 7) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = bal > 0 ? RED : GREEN;
          }
        },
      });
      y = doc.lastAutoTable.finalY + 4;

      const legend = doc.splitTextToSize(
        "Term Fee is that term's own fee. Brought Fwd is the balance carried in from earlier terms " +
        "(positive = unpaid, negative = credit). Total Due = Term Fee + Brought Fwd. " +
        "Balance = Total Due - Paid and is carried into the next term; a negative balance means you have prepaid.",
        pageWidth - 2 * M
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(legend, M, y);
      y += legend.length * 3 + 6;

      // --- Payments ---
      const paymentsSorted = [...allPayments].sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at));
      if (paymentsSorted.length > 0) {
        if (y > pageHeight - 50) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text("Payments Received", M, y);

        autoTable(doc, {
          startY: y + 2,
          theme: "grid",
          head: [["Receipt No", "Date", "Term", "Method", "Reference", "Amount (KES)"]],
          body: paymentsSorted.map((p) => [
            p.receipt_no || "-",
            new Date(p.paid_at).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" }),
            p.term_label,
            METHOD_LABEL[p.method] || p.method,
            p.reference || "-",
            currency(p.amount),
          ]),
          foot: [["Total", "", "", "", "", currency(totalPaid)]],
          showFoot: "lastPage",
          styles: { fontSize: 8, cellPadding: 1.8, overflow: "ellipsize", ...gridStyles },
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
          footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: 32 },
            1: { cellWidth: 26 },
            2: { cellWidth: 26 },
            3: { cellWidth: 22 },
            4: { cellWidth: "auto" },
            5: { cellWidth: 30, halign: "right" },
          },
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

      const safeName = String(studentName).replace(/\s+/g, "_");
      doc.save(`Fee_Statement_${safeName}_${today.toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("Failed to generate fee statement PDF:", err);
    } finally {
      setDownloadingStatement(false);
    }
  };

  // ---- Print a receipt with logo + signature/stamp blocks ----
  // Renders into a hidden iframe so only the receipt itself prints,
  // not the whole page. Matches the finance-side receipt layout.
  const handlePrintReceipt = async () => {
    if (!receipt) return;
    try {
      setPrintingReceipt(true);

      const base64Logo = await getImageBase64(logoImage);
      const logoTag = base64Logo
        ? `<img src="${base64Logo}" alt="${SCHOOL_NAME}" class="logo" />`
        : "";

      const methodLabel = METHOD_LABEL[receipt.method] || receipt.method;
      const generatedOn = new Date().toLocaleDateString("en-KE", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt - ${receipt.receipt_no}</title>
            <style>
              * { box-sizing: border-box; font-family: Helvetica, Arial, sans-serif; }
              @page { size: A5 portrait; margin: 10mm; }
              html, body { margin: 0; padding: 0; color: #0f172a; background: #fff; }
              body { padding: 20px 24px; }

              .header {
                display: flex; justify-content: space-between; align-items: flex-start;
                padding-bottom: 8px; border-bottom: 2px solid #cbd5e1;
              }
              .header-left { display: flex; align-items: center; gap: 10px; }
              .logo { width: 38px; height: 38px; object-fit: contain; }
              .school-name { font-size: 15px; font-weight: bold; margin: 0; color: #0f172a; }
              .subtitle { font-size: 11px; color: #475569; margin: 2px 0 0; }
              .meta { font-size: 9px; color: #64748b; text-align: right; line-height: 1.5; }

              .title-block { margin: 14px 0 10px; }
              .title-block h2 {
                font-size: 12.5px; font-weight: bold; color: #0f172a; margin: 0;
                text-transform: uppercase; letter-spacing: 0.4px;
              }
              .title-block p { margin: 2px 0 0; font-size: 10px; color: #64748b; }

              table.info { width: 100%; border-collapse: collapse; margin-top: 4px; }
              table.info th, table.info td {
                padding: 7px 10px; border: 1px solid #e2e8f0; font-size: 11px;
                text-align: left; vertical-align: middle;
              }
              table.info th {
                background: #f1f5f9; color: #334155; width: 38%; font-weight: 600;
              }
              .amount-row td { font-size: 13px; font-weight: bold; color: #16a34a; background: #f8fafc; }

              .excess {
                margin-top: 10px; padding: 8px 10px; border: 1px solid #bbf7d0;
                background: #f0fdf4; color: #15803d; font-size: 10px; border-radius: 4px;
              }

              .qr-block { text-align: center; margin-top: 12px; }
              .qr-block img { width: 90px; height: 90px; }
              .qr-block .qr-caption { font-size: 9px; color: #64748b; margin-top: 3px; }

              .sign-block { display: flex; justify-content: space-between; gap: 14px; margin-top: 34px; }
              .sign-line {
                flex: 1; border-top: 1px solid #94a3b8; padding-top: 5px;
                font-size: 9.5px; color: #64748b; text-align: center;
              }
              .sign-role { font-weight: 700; color: #334155; font-size: 10px; }

              .footer {
                margin-top: 20px; padding-top: 6px; border-top: 1px solid #e2e8f0;
                font-size: 8.5px; color: #94a3b8;
                display: flex; justify-content: space-between;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="header-left">
                ${logoTag}
                <div>
                  <p class="school-name">${SCHOOL_NAME}</p>
                  <p class="subtitle">Official Payment Receipt</p>
                </div>
              </div>
              <div class="meta">
                Receipt No: <strong>${receipt.receipt_no}</strong><br />
                Generated ${generatedOn}
              </div>
            </div>

            <div class="title-block">
              <h2>Official Payment Receipt</h2>
              <p>Fee payment acknowledgement issued by the Finance Department.</p>
            </div>

            <table class="info">
              <tr><th>Student</th><td>${receipt.student_name}</td></tr>
              <tr><th>Admission No</th><td>${receipt.admission_no}</td></tr>
              ${receipt.classroom ? `<tr><th>Class</th><td>${receipt.classroom}</td></tr>` : ""}
              <tr><th>Term</th><td>${receipt.term || "-"}</td></tr>
              <tr class="amount-row"><th>Amount Paid</th><td>KES ${currency(receipt.amount)}</td></tr>
              <tr><th>Method</th><td>${methodLabel}</td></tr>
              <tr><th>Reference</th><td>${receipt.reference || "-"}</td></tr>
              ${receipt.recorded_by_name ? `<tr><th>Recorded By</th><td>${receipt.recorded_by_name}</td></tr>` : ""}
              <tr><th>Date Paid</th><td>${new Date(receipt.paid_at).toLocaleString("en-KE")}</td></tr>
            </table>

            ${
              Number(receipt.excess) > 0
                ? `<div class="excess">
                     <strong>Credit note:</strong> KES ${currency(receipt.excess)} was paid above the
                     amount due and has been carried forward toward your next invoice.
                   </div>`
                : ""
            }

            ${
              receipt.qr_code_base64
                ? `<div class="qr-block">
                     <img src="data:image/png;base64,${receipt.qr_code_base64}" alt="Receipt verification QR code" />
                     <div class="qr-caption">Scan to verify this receipt</div>
                   </div>`
                : ""
            }

            <div class="sign-block">
              <div class="sign-line">
                <div class="sign-role">Finance Officer</div>
                <div>Signature &amp; Official Stamp</div>
              </div>
              <div class="sign-line">
                <div class="sign-role">Principal</div>
                <div>Signature &amp; Official Stamp</div>
              </div>
            </div>

            <div class="footer">
              <span>${SCHOOL_NAME} — Finance Department</span>
              <span>Official payment receipt</span>
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
        setTimeout(triggerPrint, 120);
      } else {
        iframe.onload = () => setTimeout(triggerPrint, 120);
      }
    } finally {
      setPrintingReceipt(false);
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: "Dashboard", href: "/student" },
        { label: "Fees", href: "/student/fees" },
        { label: "Fee Payment", href: "#" },
      ]} />

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fee Payment</h1>
          <p className="page-subtitle">
            View your fee statements and make payments
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          {!loading && (
            <span className={`badge ${netBalance > 0 ? "badge-danger" : "badge-success"}`} style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
              <i className={`bi ${netBalance > 0 ? "bi-exclamation-circle" : "bi-check-circle"} me-1`}></i>
              {netBalance < 0
                ? `Prepaid: KES ${currency(prepaidAmount)}`
                : `Balance: KES ${currency(netBalance)}`}
            </span>
          )}
          <a href="/student/fee-structure" className="btn btn-sm btn-outline-secondary">
            <i className="bi bi-card-list me-1"></i>
            Fee Structure
          </a>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={openPayModal}
            disabled={loading || invoices.length === 0}
          >
            <i className="bi bi-phone me-1"></i>
            {netBalance > 0 ? "Pay Fees" : "Pay in Advance"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={handleDownloadStatement}
            disabled={loading || downloadingStatement || invoices.length === 0}
          >
            {downloadingStatement ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                Preparing...
              </>
            ) : (
              <>
                <i className="bi bi-file-earmark-pdf me-1"></i>
                Download Statement
              </>
            )}
          </button>
        </div>
      </div>

      {/* Fee Structure Missing Banner */}
      {feeStatus && feeStatus.has_fee_structure === false && (
        <div
          className="alert alert-warning mb-4"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <i className="bi bi-exclamation-triangle" style={{ fontSize: "1.2rem" }}></i>
          <span>{feeStatus.message}</span>
        </div>
      )}

      {/* Balance Banners */}
      {!loading && netBalance > 0 && (
        <div className="alert alert-warning mb-4" style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap"
        }}>
          <i className="bi bi-exclamation-circle" style={{ fontSize: "1.2rem" }}></i>
          <span>
            You have an outstanding balance of <strong>KES {netBalance.toLocaleString()}</strong> across
            your fee statements. You don't need to pay it all at once — partial payments are accepted and
            are applied to your oldest unpaid term first.
          </span>
          <button className="btn btn-sm btn-primary ms-auto" onClick={openPayModal}>
            <i className="bi bi-phone me-1"></i>Pay Now
          </button>
        </div>
      )}
      {!loading && netBalance < 0 && (
        <div className="alert alert-success mb-4" style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap"
        }}>
          <i className="bi bi-piggy-bank" style={{ fontSize: "1.2rem" }}></i>
          <span>
            You have prepaid <strong>KES {Math.abs(netBalance).toLocaleString()}</strong>. This credit will be
            applied automatically to your next term's fees.
          </span>
        </div>
      )}

      {/* Summary cards: what you owed, what was carried forward, what you paid, where you stand */}
      {!loading && invoices.length > 0 && (
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="stat-card" style={{ padding: "0.75rem 1rem" }}>
              <div>
                <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>KES {currency(totalDue)}</div>
                <div className="stat-card__label">Total Fees Charged</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="stat-card stat-card--gold" style={{ padding: "0.75rem 1rem" }}>
              <div>
                <div
                  className="stat-card__value"
                  style={{
                    fontSize: "1.2rem",
                    color: latestBroughtForward > 0 ? "var(--danger-600)" : latestBroughtForward < 0 ? "var(--success-600)" : undefined,
                  }}
                >
                  {bfText(latestBroughtForward)}
                </div>
                <div className="stat-card__label">
                  Brought Forward{latestInvoice ? ` (${latestInvoice.term_label})` : ""}
                </div>
                <div className="stat-card__label" style={{ fontSize: "0.7rem" }}>
                  {latestBroughtForward > 0
                    ? "Unpaid from earlier terms"
                    : latestBroughtForward < 0
                      ? "Credit from earlier terms"
                      : "Nothing carried in"}
                </div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="stat-card stat-card--success" style={{ padding: "0.75rem 1rem" }}>
              <div>
                <div className="stat-card__value" style={{ fontSize: "1.2rem" }}>KES {currency(totalPaid)}</div>
                <div className="stat-card__label">Total Paid</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="stat-card stat-card--blue" style={{ padding: "0.75rem 1rem" }}>
              <div>
                <div
                  className="stat-card__value"
                  style={{
                    fontSize: "1.2rem",
                    color: netBalance > 0 ? "var(--danger-600)" : "var(--success-600)",
                  }}
                >
                  KES {currency(Math.abs(netBalance))}
                </div>
                <div className="stat-card__label">
                  {netBalance > 0 ? "Balance Owing" : netBalance < 0 ? "Prepaid (Credit)" : "Balance"}
                </div>
                {netBalance < 0 && (
                  <div className="stat-card__label" style={{ fontSize: "0.7rem" }}>Applied to next term</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoices Table */}
      {loading ? (
        <TableSkeleton rows={5} columns={7} />
      ) : invoices.length === 0 ? (
        <div className="table-wrap mb-4">
          <div className="empty-state">
            <i className="bi bi-cash-stack"></i>
            <h6>No Fee Statements</h6>
            <p className="text-muted-soft">
              You don't have any fee statements at the moment.
              Please contact the finance office for assistance.
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrap mb-4">
          <div className="table-wrap__header">
            <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              <i className="bi bi-receipt me-2"></i>
              Fee Statements
              <span className="badge badge-neutral ms-2">{invoices.length}</span>
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              <i className="bi bi-calendar3 me-1"></i>
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Grade</th>
                  <th className="text-end">Brought Fwd</th>
                  <th className="text-end">Term Fee</th>
                  <th className="text-end">Total Due</th>
                  <th className="text-end">Paid</th>
                  <th className="text-end">Balance c/f</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <span style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                        {inv.term_label}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-blue">{inv.grade_level_name}</span>
                    </td>
                    <td className={`text-end ${Number(inv.brought_forward) < 0 ? "text-success" : Number(inv.brought_forward) > 0 ? "text-danger" : ""}`}>
                      {Number(inv.brought_forward).toLocaleString()}
                    </td>
                    <td className="text-end">{Number(inv.term_charge).toLocaleString()}</td>
                    <td className="text-end">{Number(inv.amount_due).toLocaleString()}</td>
                    <td className="text-end text-success">{Number(inv.amount_paid).toLocaleString()}</td>
                    <td className={`text-end fw-bold ${Number(inv.balance) > 0 ? "text-danger" : "text-success"}`}>
                      {Number(inv.balance).toLocaleString()}
                      {Number(inv.balance) < 0 && (
                        <span className="badge badge-success ms-1" style={{ fontSize: "0.65rem" }}>Prepaid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap__footer">
            <span className="table-wrap__footer-info">
              Showing <strong>{invoices.length}</strong> invoice{invoices.length !== 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-400)" }}>
              Each term's balance is carried into the next term.
            </span>
          </div>
        </div>
      )}

      {/* Payment History */}
      {!loading && allPayments.length > 0 && (
        <>
          <h6 className="mb-2" style={{ fontWeight: 600, color: "var(--ink-700)" }}>
            <i className="bi bi-clock-history me-2" style={{ color: "var(--blue-700)" }}></i>
            Payment History
          </h6>
          <div className="table-wrap">
            <div className="table-wrap__header">
              <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                <i className="bi bi-list-ul me-2"></i>
                All Payments
                <span className="badge badge-neutral ms-2">{allPayments.length}</span>
              </span>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Receipt No</th>
                    <th>Term</th>
                    <th className="text-end">Amount (KES)</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th style={{ width: "100px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {allPayments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--blue-700)", fontSize: "var(--fs-sm)" }}>
                          {p.receipt_no}
                        </span>
                      </td>
                      <td>{p.term_label}</td>
                      <td className="text-end fw-bold text-success">
                        KES {Number(p.amount).toLocaleString()}
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          <i className="bi bi-phone me-1"></i>
                          {p.method}
                        </span>
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)", color: "var(--ink-600)" }}>
                        {new Date(p.paid_at).toLocaleDateString('en-KE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => viewReceipt(p.id)}
                          style={{ width: "100%" }}
                        >
                          <i className="bi bi-receipt me-1"></i>Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Payment Modal - one general payment, split across terms automatically */}
      {showPayModal && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              {payStatus === "COMPLETED" ? (
                <div className="modal-body text-center py-4">
                  <i className="bi bi-check-circle-fill text-success" style={{ fontSize: "3rem" }}></i>
                  <h5 className="mt-3" style={{ fontWeight: 700 }}>Payment Successful</h5>
                  <p className="text-muted">Your payment was applied to your fee statements:</p>
                  {paidPayments.length > 0 && (
                    <table className="table table-sm text-start mb-3">
                      <tbody>
                        {paidPayments.map((p) => (
                          <tr key={p.id}>
                            <td>{p.term_label}</td>
                            <td className="text-end fw-bold text-success">KES {currency(p.amount)}</td>
                            <td className="text-end">
                              <button className="btn btn-sm btn-outline-primary" onClick={() => viewReceipt(p.id)}>
                                <i className="bi bi-receipt me-1"></i>Receipt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <button className="btn btn-primary" onClick={closePayModal}>
                    <i className="bi bi-check2 me-2"></i>Close
                  </button>
                </div>
              ) : payStatus === "FAILED" ? (
                <div className="modal-body text-center py-4">
                  <i className="bi bi-x-circle-fill text-danger" style={{ fontSize: "3rem" }}></i>
                  <h5 className="mt-3" style={{ fontWeight: 700 }}>Payment Failed</h5>
                  <p className="text-danger">{payError}</p>
                  <button className="btn btn-primary" onClick={() => setPayStatus("")}>
                    <i className="bi bi-arrow-repeat me-2"></i>Try Again
                  </button>
                </div>
              ) : payStatus === "PENDING" ? (
                <div className="modal-body text-center py-4">
                  <div className="spinner-border text-primary mb-3" role="status" style={{ width: "3rem", height: "3rem" }}></div>
                  <h5 style={{ fontWeight: 700 }}>Check your phone</h5>
                  <p className="text-muted">
                    An M-Pesa prompt has been sent to <strong>{phone}</strong>. Enter your PIN to
                    complete the payment of <strong>KES {currency(amount)}</strong>.
                  </p>
                  <div className="text-muted small">
                    <i className="bi bi-clock me-1"></i>
                    Waiting for confirmation...
                  </div>
                </div>
              ) : (
                <>
                  <div className="modal-header">
                    <h5 className="modal-title" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                      <i className="bi bi-credit-card me-2" style={{ color: "var(--blue-700)" }}></i>
                      Pay School Fees
                    </h5>
                    <button type="button" className="btn-close" onClick={closePayModal}></button>
                  </div>
                  <form onSubmit={submitPayment}>
                    <div className="modal-body">
                      <div className="alert alert-light border small py-2 mb-3">
                        {netBalance > 0 ? (
                          <>Total outstanding: <strong>KES {currency(netBalance)}</strong>. </>
                        ) : (
                          <>Your account is settled. Anything you pay now is kept as credit for your next term. </>
                        )}
                        Your payment is applied automatically to your oldest unpaid term first, then the next,
                        and so on. Partial payments are fine.
                      </div>

                      {payError && (
                        <div className="alert alert-danger py-2">
                          <i className="bi bi-exclamation-circle me-2"></i>
                          {payError}
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="form-label">Amount (KES)</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="form-control"
                          required
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Enter amount to pay"
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label">
                          <i className="bi bi-phone me-1" style={{ color: "var(--blue-700)" }}></i>
                          M-Pesa Phone Number
                        </label>
                        <input
                          className="form-control"
                          required
                          placeholder="07XXXXXXXX"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-outline-secondary" onClick={closePayModal}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={payStatus === "SUBMITTING"}>
                        {payStatus === "SUBMITTING" ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Sending...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-send me-2"></i>
                            Pay with M-Pesa
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal - Bootstrap Modal */}
      {showReceiptModal && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex="-1" role="dialog" onClick={closeReceiptModal}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "560px" }} role="document" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" style={{ fontWeight: 700, color: "var(--ink-900)" }}>
                  <i className="bi bi-receipt me-2" style={{ color: "var(--blue-700)" }}></i>
                  Payment Receipt
                </h5>
                <button type="button" className="btn-close" onClick={closeReceiptModal}></button>
              </div>
              <div className="modal-body">
                {receiptLoading ? (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" role="status" style={{ width: "3rem", height: "3rem" }}></div>
                    <p className="mt-2 text-muted">Loading receipt...</p>
                  </div>
                ) : (
                  <ReceiptCard receipt={receipt} />
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={closeReceiptModal}>
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handlePrintReceipt}
                  disabled={receiptLoading || !receipt || printingReceipt}
                >
                  {printingReceipt ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Preparing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-printer me-2"></i>
                      Print / Save PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}