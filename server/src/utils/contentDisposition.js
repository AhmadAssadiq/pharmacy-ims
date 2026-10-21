/**
 * Content-Disposition for a stored chat image (GP2 addition). Pure, tested.
 * RFC 6266: an ASCII `filename` for old clients plus `filename*` carrying the
 * full UTF-8 name (Arabic names included). Quotes and backslashes are dropped
 * from the ASCII copy so the header value cannot be broken out of.
 */
function contentDisposition(name, type = 'inline') {
  const ascii = String(name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

module.exports = { contentDisposition };
