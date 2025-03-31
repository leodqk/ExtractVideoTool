// utils/pathUtils.js - Xử lý đường dẫn

export function normalizeImagePath(path) {
  if (!path) return null;

  // Chuyển đổi backslash sang forward slash
  let normalizedPath = path.replace(/\\/g, "/");

  // Kiểm tra xem đường dẫn đã có /static/ chưa
  if (
    !normalizedPath.startsWith("/static/") &&
    !normalizedPath.startsWith("http") &&
    !normalizedPath.startsWith("data:")
  ) {
    normalizedPath = `/static/${normalizedPath}`;
  }

  return normalizedPath;
}

export function formatTime(seconds) {
  if (seconds === undefined || seconds === null) return "N/A";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs < 10 ? "0" + secs : secs}`;
}

export function formatScriptText(text) {
  // Thay thế xuống dòng bằng thẻ <p>
  let formatted = text.replace(/\n\n/g, "</p><p>");

  // Làm nổi bật các phần quan trọng
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");

  return `<p>${formatted}</p>`;
}

export function formatPromptText(text) {
  // Replace line breaks with HTML line breaks
  let formatted = text.replace(/\n/g, "<br>");

  // Highlight keywords that might be parameters or special terms
  formatted = formatted.replace(
    /\b([A-Z]{2,}|--[a-z-]+)\b/g,
    '<span class="prompt-keyword">$1</span>'
  );

  // Highlight values in quotes
  formatted = formatted.replace(
    /"([^"]*)"/g,
    '"<span class="prompt-value">$1</span>"'
  );

  return formatted;
}
