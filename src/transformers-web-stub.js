// Web beta intentionally ships without the on-device transformer runtime.
// Search already short-circuits AI inference in WEB_MODE; this guards any
// accidental call without pulling the large runtime and model assets into dist-web.
export async function pipeline() {
  throw new Error('On-device AI is unavailable in the web beta.');
}
