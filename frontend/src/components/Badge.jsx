export default function Badge({ value }) {
  const slug = String(value || '').toLowerCase().replace(/\s+/g, '_');
  return <span className={`badge badge-${slug}`}>{value?.replace(/_/g, ' ')}</span>;
}
