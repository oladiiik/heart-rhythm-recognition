/**
 * Пропускає не частіше ніж раз на intervalMs; останнє повідомлення пропускає завжди,
 * щоб інтерфейс отримав підсумковий стан
 */
export function createThrottle(intervalMs: number): (isLast: boolean) => boolean {
  let lastSentAt = -Infinity;
  return (isLast) => {
    const now = performance.now();
    if (!isLast && now - lastSentAt < intervalMs) return false;
    lastSentAt = now;
    return true;
  };
}
