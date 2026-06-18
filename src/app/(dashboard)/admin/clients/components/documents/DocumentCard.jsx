import Image from "next/image";

export default function DocumentCard({ doc, onPreview }) {
  const previewUrl = doc.preview_url || doc.file_url;
  const fileName = `${doc.file_name || previewUrl || ""}`.toLowerCase();
  const isImage = doc.file_type?.startsWith("image/") || fileName.match(/\.(jpeg|jpg|png|webp)$/i);
  const isPDF = doc.file_type === "application/pdf" || fileName.match(/\.pdf$/i);

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      
      {/* 🧾 Title */}
      <p className="text-sm font-medium text-gray-700">
        {doc.document_type || "Document"}
      </p>

      {/* 👇 Clickable Preview */}
      <button
        type="button"
        onClick={() => onPreview(doc)}
        className="w-full h-40 bg-white border rounded overflow-hidden flex items-center justify-center cursor-pointer hover:shadow-md transition"
      >
        {isImage ? (
          <Image
            src={previewUrl}
            alt={doc.document_type || "Document preview"}
            width={320}
            height={160}
            className="object-cover w-full h-full hover:scale-105 transition"
            unoptimized
          />
        ) : isPDF ? (
          <iframe
            src={previewUrl}
            className="w-full h-full pointer-events-none"
          />
        ) : (
          <p className="text-xs text-gray-400">Preview document</p>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Click to preview
      </p>
    </div>
  );
}
