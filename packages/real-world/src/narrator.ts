import type { Locale, SimEventFact } from '@lifesim/content-schema';
import { placeNameAt, type CountryPack } from '@lifesim/country-packs';
import {
  createTemplateNarrator,
  mergeMessageTrees,
  type MessageTree,
  type TemplateNarrator,
} from '@lifesim/narrative';
import { LIFE_NARRATIVE } from '@lifesim/systems';
import type { ISODate } from '@lifesim/content-schema';

function labels(pack: CountryPack, birthDate: ISODate, locale: Locale): MessageTree {
  const places: Record<string, string> = {};
  for (const place of pack.places) {
    places[place.id] = placeNameAt(pack, place.id, birthDate)[locale];
  }
  const currencies: Record<string, string> = {};
  for (const [version, name] of Object.entries(pack.currency.versionNames)) {
    currencies[pack.currency.code + '-' + version] = name[locale];
  }
  const polities: Record<string, string> = {};
  for (const entity of pack.politicalEntities) {
    polities[entity.id] = entity.names[locale];
  }
  // polity-change 模板使用 from/to 作为占位符名，所以同名枚举也要指向政体显示名。
  return {
    enums: { place: places, currency: currencies, polity: polities, from: polities, to: polities },
  };
}

/** 真实国家包的叙事资源：系统模板 + 该包的地点与币制名称。 */
export function realNarrativeResources(
  pack: CountryPack,
  birthDate: ISODate,
): Record<Locale, MessageTree> {
  return {
    'zh-Hans': mergeMessageTrees(LIFE_NARRATIVE['zh-Hans'], labels(pack, birthDate, 'zh-Hans')),
    en: mergeMessageTrees(LIFE_NARRATIVE.en, labels(pack, birthDate, 'en')),
  };
}

/** 币制版本的显示名，例如 CNY-2 → “人民币 (CNY)”。 */
export function realCurrencyName(pack: CountryPack, currencyLabel: string, locale: Locale): string {
  const separator = currencyLabel.lastIndexOf('-');
  if (separator < 0) return currencyLabel;
  const code = currencyLabel.slice(0, separator);
  const version = currencyLabel.slice(separator + 1);
  const name = pack.currency.versionNames[version];
  return name ? name[locale] + ' (' + code + ')' : currencyLabel;
}

function decimalsFor(currencyLabel: string): number {
  return currencyLabel.startsWith('JPY-') ? 0 : 2;
}

/** 整数最小单位 → 带货币小数位的可读金额；JPY 没有小数位。 */
export function formatRealMoney(minor: number, currencyLabel: string, locale: Locale): string {
  const decimals = decimalsFor(currencyLabel);
  const divisor = 10 ** decimals;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(minor / divisor);
}

export interface RealNarrator {
  render(fact: SimEventFact, locale: Locale): string;
  label(name: string, value: string | number | boolean | null, locale: Locale): string;
}

/**
 * 每个事实按自己的币制选择金额格式；同一事实在两种语言下渲染不同文本，
 * 但不影响事实本身（GDD §7）。
 */
export function createRealNarrator(pack: CountryPack, birthDate: ISODate): RealNarrator {
  const resources = realNarrativeResources(pack, birthDate);
  const base = createTemplateNarrator({ resources });
  const cache = new Map<string, TemplateNarrator>();

  function narratorFor(locale: Locale, currencyLabel: string): TemplateNarrator {
    const key = locale + '|' + String(decimalsFor(currencyLabel));
    const existing = cache.get(key);
    if (existing) return existing;
    const created = createTemplateNarrator({
      resources,
      formatParam(name, value) {
        if (name.endsWith('Minor') && typeof value === 'number') {
          return formatRealMoney(value, currencyLabel, locale);
        }
        if (name === 'currency' || name === 'fromCurrency' || name === 'toCurrency') {
          return realCurrencyName(pack, String(value), locale);
        }
        return undefined;
      },
    });
    cache.set(key, created);
    return created;
  }

  return {
    render(fact, locale) {
      const details = fact.details ?? {};
      const currency =
        typeof details['currency'] === 'string'
          ? details['currency']
          : typeof details['fromCurrency'] === 'string'
            ? details['fromCurrency']
            : pack.currency.code + '-' + pack.currency.initialVersion;
      return narratorFor(locale, currency).render(fact, locale);
    },
    label(name, value, locale) {
      return base.label(name, value, locale);
    },
  };
}
