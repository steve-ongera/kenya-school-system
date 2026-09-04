export default function TableSkeleton({ rows = 5, columns = 6 }) {
  return (
    <div className="table-responsive">
      <table className="table mb-0">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}><div className="skeleton skeleton-text" style={{ width: "80%" }}></div></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: columns }).map((_, j) => (
                <td key={j}>
                  <div className="skeleton skeleton-text" style={{ width: j === 1 ? "60%" : "70%" }}></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}