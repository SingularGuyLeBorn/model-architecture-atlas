import config from "./configs/Qwen3.8-Flash-Next.json" with { type: "json" };

// 与固定版本 qwen4_exp 的 NGramEmbedding 对齐；seed 为配置类的官方默认值。
const c = config.text_config;
const mask64 = (1n << 64n) - 1n;
const gamma = 0x9e3779b97f4a7c15n;
function splitmix64(value: bigint) {
  let x = (value + gamma) & mask64;
  x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & mask64;
  x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & mask64;
  return (x ^ (x >> 31n)) & mask64;
}
function prime(n: number) {
  if (n < 2 || n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}
const primes: number[] = [];
for (let n = c.ngram_vocab_size_base; primes.length < 16; n++)
  if (prime(n)) primes.push(n);
const bound = ((1n << 63n) - 1n) / BigInt(c.vocab_size) / 2n;
const multipliers = [0, 1, 2].map(
  (j) =>
    2n * (splitmix64((1234n + gamma * BigInt(j + 1)) & mask64) % bound) + 1n,
);
const offsets = primes.map((_, i) =>
  primes.slice(0, i).reduce((a, b) => a + b, 0),
);
const total = primes.reduce((a, b) => a + b, 0);
export const qwenPle = {
  primes,
  offsets,
  multipliers,
  rows:
    Math.ceil(total / c.make_ngram_vocab_size_divisible_by) *
    c.make_ngram_vocab_size_divisible_by,
  usedRows: total,
  dim: c.ple_embed_dim / 16,
  eos: c.eos_token_id,
};

/** 图中 t 从 1 起，地址从 0 起；历史不足或跨过前一个 EOS 时以 EOS 补位。 */
export function qwenPleWindow(history: readonly number[], t: number) {
  if (t < 1 || t > history.length) throw new Error("PLE token 位置越界");
  return [0, 1, 2].map((shift) => {
    const index = t - 1 - shift;
    if (index < 0 || history.slice(index, t - 1).includes(qwenPle.eos))
      return qwenPle.eos;
    return history[index];
  });
}
export function qwenPleAddresses(history: readonly number[], t: number) {
  const ids = qwenPleWindow(history, t).map(BigInt);
  return [2, 3].flatMap((n) => {
    let mixed = 0n;
    for (let j = 0; j < n; j++) mixed ^= ids[j] * multipliers[j];
    return Array.from({ length: 8 }, (_, h) => {
      const i = (n - 2) * 8 + h;
      return offsets[i] + Number(mixed % BigInt(primes[i]));
    });
  });
}
