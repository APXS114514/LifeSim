import type { RandomStream } from '@lifesim/simulation-core';

/**
 * 合成地区「ZZ-SYN」的虚构姓名音节表 —— **D 类游戏设计假设**（GDD §9.1、ADR-0010 A2.2）。
 *
 * 名字由音节拼成，不对应任何真实文化的人名体系，也不用于真实地区。
 * 音节集合刻意选成五种语言（中、日、韩、俄）都不使用的音素组合，
 * 再由测试校验生成的名字不与 `packages/country-packs/names/` 里的真实姓名重合。
 */

export const SYNTHETIC_NAME_GRADE = 'D' as const;

/**
 * 音节表：每个音节 = 声母 + 韵母 + 韵尾（韵尾可为空）。
 *
 * 两条构造约束让音节切分唯一（测试按同一规则切分校验）：
 * 声母词表只有单个辅音；韵母表把复合韵母排在单元音之前；
 * 韵尾只用 `s`/`r`/`f`，它们不出现在任何声母里，因此不会与下一个音节混淆。
 */
export interface SyntheticSyllables {
  readonly onset: readonly string[];
  readonly nucleus: readonly string[];
  readonly coda: readonly string[];
}

export const SYNTHETIC_FAMILY_SYLLABLES: SyntheticSyllables = {
  onset: ['v', 'z', 'k', 'm', 't', 'n', 'b', 'g', 'd', 'l'],
  nucleus: ['ai', 'ei', 'au', 'a', 'e', 'i', 'o', 'u'],
  coda: ['', 's', 'r', 'f'],
};

export const SYNTHETIC_GIVEN_SYLLABLES: Readonly<Record<'female' | 'male', SyntheticSyllables>> = {
  female: {
    onset: ['v', 'z', 'k', 'm', 't', 'n', 'b', 'g', 'd', 'l'],
    nucleus: ['ai', 'ei', 'a', 'e', 'i', 'o', 'u'],
    coda: ['', 's', 'r'],
  },
  male: {
    onset: ['v', 'z', 'k', 'm', 't', 'n', 'b', 'g', 'd', 'l'],
    nucleus: ['au', 'ei', 'e', 'i', 'o', 'u'],
    coda: ['', 'f', 's', 'r'],
  },
};

/** 姓名的音节数（固定，便于测试与显示）。 */
export const SYNTHETIC_NAME_SYLLABLES = 2;

function syllable(parts: SyntheticSyllables, random: RandomStream): string {
  const onset = parts.onset[random.int(parts.onset.length)] ?? '';
  const nucleus = parts.nucleus[random.int(parts.nucleus.length)] ?? '';
  const coda = parts.coda[random.int(parts.coda.length)] ?? '';
  return `${onset}${nucleus}${coda}`;
}

function capitalise(word: string): string {
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function word(parts: SyntheticSyllables, random: RandomStream): string {
  let result = '';
  for (let index = 0; index < SYNTHETIC_NAME_SYLLABLES; index += 1) {
    result += syllable(parts, random);
  }
  return capitalise(result);
}

/** 虚构的姓。抽取顺序固定（每个音节：声母、韵母、韵尾）。 */
export function syntheticFamilyName(random: RandomStream): string {
  return word(SYNTHETIC_FAMILY_SYLLABLES, random);
}

/** 虚构的名。按性别用不同的韵母集合，模拟「名字区分性别」这一习俗差异。 */
export function syntheticGivenName(sex: 'female' | 'male', random: RandomStream): string {
  return word(SYNTHETIC_GIVEN_SYLLABLES[sex], random);
}

/** 完整的虚构姓名；姓先抽、名后抽，调用顺序即随机流消费顺序。 */
export function syntheticPersonName(
  sex: 'female' | 'male',
  random: RandomStream,
): { family: string; given: string } {
  const family = syntheticFamilyName(random);
  const given = syntheticGivenName(sex, random);
  return { family, given };
}
