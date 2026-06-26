// server/helpers/modelCache.js
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
const modelCache = new Map();

/**
 * Cache kết quả checkModelSupport với TTL 5 phút
 * Cache sẽ tự hết hạn theo thời gian
 */
function getCachedModelSupport(model) {
  const entry = modelCache.get(model);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    modelCache.delete(model);
    return undefined;
  }
  return entry.supported;
}

function setCachedModelSupport(model, supported) {
  modelCache.set(model, {
    supported,
    timestamp: Date.now()
  });
}

/**
 * Xóa toàn bộ cache - dùng khi đổi config database
 */
function clearModelCache() {
  modelCache.clear();
  console.log('[ModelCache] Cleared all cached model support results');
}

module.exports = {
  getCachedModelSupport,
  setCachedModelSupport,
  clearModelCache
};
