/**
 * 确定性的 exp / ln。
 *
 * ECMAScript 只规定 `Math.exp`、`Math.log` 的近似精度，不同 JS 引擎的末位可能不同；
 * 风险计算 `H = -ln(1-q)`、`P = 1 - exp(-H)`（GDD §8.3）的结果一旦在临界处差一位，
 * 就可能翻转一次抽样，让同一存档在不同浏览器里走向不同结局。
 * 这里只用 IEEE 754 规定为正确舍入的四则运算与 `Math.round`，任何引擎结果逐位一致；
 * 精度约 1e-15（相对），对概率计算足够。
 */

const LN2 = 0.6931471805599453;
// fdlibm 的 ln2 拆分：高位末尾带零，使 k * LN2_HI 在 |k| < 2^11 时精确。
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.9082149292705877e-10;
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;

function scaleByPowerOfTwo(value: number, exponent: number): number {
  let result = value;
  if (exponent > 0) for (let i = 0; i < exponent; i++) result *= 2;
  else for (let i = 0; i < -exponent; i++) result /= 2;
  return result;
}

export function expDet(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2_HI - k * LN2_LO; // |r| <= ln2 / 2
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 18; n++) {
    term = (term * r) / n;
    sum += term;
  }
  return scaleByPowerOfTwo(sum, k);
}

export function lnDet(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let m = x;
  let k = 0;
  while (m > SQRT2) {
    m /= 2;
    k++;
  }
  while (m < SQRT1_2) {
    m *= 2;
    k--;
  }
  // ln m = 2·atanh(s)，s = (m-1)/(m+1)，|s| <= 0.1716，级数收敛很快。
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let power = s;
  let series = 0;
  for (let n = 1; n <= 31; n += 2) {
    series += power / n;
    power *= s2;
  }
  return k * LN2_HI + (k * LN2_LO + 2 * series);
}

/**
 * 年度死亡概率 q 在风险乘数 multiplier 下的个体概率（GDD §8.3）：
 * `H = -ln(1-q)`，`P = 1 - exp(-H · multiplier)`。
 */
export function scaleAnnualProbability(q: number, multiplier: number): number {
  if (!(q >= 0 && q <= 1)) throw new RangeError(`Probability out of range: ${q}`);
  if (!(multiplier >= 0)) throw new RangeError(`Invalid multiplier: ${multiplier}`);
  if (q === 1) return multiplier > 0 ? 1 : 0;
  return 1 - expDet(lnDet(1 - q) * multiplier);
}
