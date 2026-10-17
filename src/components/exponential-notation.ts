/** 指数是运算，只有输入变量加框；调用方不再给整个 e 的幂套数据框。 */
export function exponentialTex(variable: string) {
  return `e^{\\boxed{${variable}}}`;
}

/** 同组分数的归一化，索引决定分子，所有分数共同构成分母。 */
export function normalizedExponentialTex(
  scores: readonly string[],
  index: number,
) {
  if (!scores.length || index < 0 || index >= scores.length)
    throw new Error("归一化指数的分子必须来自非空分数组。");
  return `\\frac{${exponentialTex(scores[index])}}{${scores.map(exponentialTex).join("+")}}`;
}
