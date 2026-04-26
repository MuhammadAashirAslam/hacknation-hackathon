export default function BookLoader() {
  return (
    <div className="book-loader-root" aria-hidden>
      <div className="book-loader" role="status" aria-label="Loading">
        <div className="book-cover" />
        <div className="book-spine" />
        <div className="book-page book-page-3" />
        <div className="book-page book-page-2" />
        <div className="book-page" />
        <div className="book-loader-text">Loading</div>
      </div>
    </div>
  );
}
