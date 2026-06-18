import Image from "next/image";

export default function DocumentModal({ document, onClose }) {
  if (!document) return null;

  const previewUrl = document.preview_url || document.file_url;
  const fileName = `${document.file_name || previewUrl || ""}`.toLowerCase();
  const isImage = document.file_type?.startsWith("image/") || fileName.match(/\.(jpeg|jpg|png|webp)$/i);
  const isPDF = document.file_type === "application/pdf" || fileName.match(/\.pdf$/i);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close preview" />

      <div className="relative bg-white rounded-xl w-[90%] max-w-4xl h-[80%] p-4 flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <p className="font-medium text-gray-800">
            {document.document_type || "Document Preview"}
          </p>

          <button onClick={onClose} className="text-lg text-gray-600 hover:text-red-600">x</button>
        </div>

        <div className="flex-1 border rounded overflow-hidden bg-gray-100 flex items-center justify-center">
          {document.previewError ? (
            <p className="text-sm text-red-500">{document.previewError}</p>
          ) : isImage ? (
            <Image
              src={previewUrl}
              alt={document.document_type || "Document preview"}
              width={960}
              height={720}
              className="max-h-full max-w-full object-contain"
              unoptimized
            />
          ) : isPDF ? (
            <iframe src={previewUrl} className="w-full h-full" />
          ) : (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600">
              Open document
            </a>
          )}
        </div>

        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 text-sm mt-3 text-right"
          >
            Open in new tab
          </a>
        )}
      </div>
    </div>
  );
}
