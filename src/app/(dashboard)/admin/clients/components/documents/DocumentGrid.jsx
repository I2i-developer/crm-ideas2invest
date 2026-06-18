import DocumentCard from "./DocumentCard";

export default function DocumentGrid({ documents, onPreview }) {
  if (!documents.length) {
    return (
      <p className="text-gray-500 text-sm col-span-3">
        No documents uploaded
      </p>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-3">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} doc={doc} onPreview={onPreview} />
      ))}
    </div>
  );
}