/** ミリ秒を mm:ss.mmm 形式に整形する（要件 3.3 ミリ秒単位の調整を見せるため）。 */
export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const millis = Math.floor(ms % 1000);
  return `${m}:${s.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}

/** mm:ss 形式（粗い表示用）。 */
export function formatMsShort(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
