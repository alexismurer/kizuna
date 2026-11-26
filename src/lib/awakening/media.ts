// True when a loop url points at a video file (.mp4 / .webm), ignoring any query or hash
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)$/i.test(url.split(/[?#]/)[0]);
}
