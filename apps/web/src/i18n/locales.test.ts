import { checkLocaleParity } from '@lifesim/narrative';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';

describe('UI text resources', () => {
  it('have the same keys, no empty strings and matching placeholders in zh-Hans and en', () => {
    expect(checkLocaleParity({ 'zh-Hans': zhHans, en })).toEqual([]);
  });
});
