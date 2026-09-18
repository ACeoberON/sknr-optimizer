/**
 * 시드 고정 난수 생성기 (mulberry32).
 * 테스트 재현성을 위해 시드가 같으면 항상 같은 수열을 낸다. [0, 1) 반환.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
