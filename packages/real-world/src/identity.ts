import type { CharacterState, Locale, NameRef } from '@lifesim/content-schema';
import { NAME_TABLES, resolveNameForm } from '@lifesim/country-packs';

/** 只解析已保存的引用，切换语言不抽样。缺少姓/名时由界面披露数据缺口。 */
export function characterName(actor: CharacterState, locale: Locale): string | null {
  const resolve = (ref: NameRef | null): string | null => {
    if (ref === null) return null;
    const entry = NAME_TABLES[ref.table]?.entries.find((candidate) => candidate.id === ref.id);
    return entry ? resolveNameForm(entry, actor.sex)[locale] : null;
  };
  const family = resolve(actor.name.family);
  const given = resolve(actor.name.given);
  if (family === null || given === null) return null;
  const patronymic = resolve(actor.name.patronymic);
  if (actor.name.scheme === 'ru')
    return [given, patronymic, family].filter(Boolean).join(locale === 'en' ? ' ' : '·');
  return locale === 'en' ? `${family} ${given}` : `${family}${given}`;
}
