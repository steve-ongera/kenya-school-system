import { useEffect, useState } from "react";
import { financeApi } from "../../services/api";

export default function FinanceDashboard() {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    financeApi.invoices().then(({ data }) => setInvoices(data.results ?? data));
  }, []);

  const totalDue = invoices.reduce((s, i) => s + Number(i.amount_due), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
  const totalBalance = totalDue - totalPaid;

  return (
    <div>
      <h2 className="page-title">Finance Dashboard</h2>
      <div className="row g-3">
        <div className="col-md-4">
          <div className="stat-card">
            <i className="bi bi-receipt"></i>
            <div>
              <div className="stat-card__value">KES {totalDue.toLocaleString()}</div>
              <div className="stat-card__label">Total Invoiced</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card">
            <i className="bi bi-cash-coin"></i>
            <div>
              <div className="stat-card__value">KES {totalPaid.toLocaleString()}</div>
              <div className="stat-card__label">Total Collected</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card">
            <i className="bi bi-exclamation-circle"></i>
            <div>
              <div className="stat-card__value">KES {totalBalance.toLocaleString()}</div>
              <div className="stat-card__label">Outstanding Balance</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
