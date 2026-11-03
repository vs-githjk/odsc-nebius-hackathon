// 95% upper bound on the error rate after 0 failures in n trials: 1 minus 0.05^(1/n) (the "rule of three" family).
export function bound(failures: number, n: number): number {
  if (failures !== 0) throw new Error("only the zero-failure bound is built");
  if (n <= 0) return 1;
  return 1 - 0.05 ** (1 / n);
}
