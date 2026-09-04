export default function EmptyState({ 
  icon = "bi-people", 
  title = "No students found", 
  message = "Try adjusting your search or filters" 
}) {
  return (
    <div className="empty-state">
      <i className={`bi ${icon}`}></i>
      <h6>{title}</h6>
      <p className="text-muted-soft">{message}</p>
    </div>
  );
}