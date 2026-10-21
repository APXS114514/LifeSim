/**
 * 国家包数据指纹 —— **高风险文件**。
 *
 * 只有数据有意更新、并且维护者审查之后，才能修改这里的值。
 * 键是序列 id，值是对 `canonicalJson(series)` 计算的 fingerprint。
 */
export const DATA_FINGERPRINTS: Record<string, string> = {
  'wpp2024/CN/births': '2c4b85e8a9a0aa2f7983a6b27265d712',
  'wpp2024/CN/qx': 'ab80914c75e68794730cbce0ad5f7960',
  'wdi/CN/urban-share': '19a5cdeb240ee0da63b122f9faea5379',
  'wpp2024/JP/births': 'ef888f2f344be20088c0438e7ed95adc',
  'wpp2024/JP/qx': 'b806b29563338a8354036f103d21f9f5',
  'wdi/JP/urban-share': '2a5e15865694928507ec5fdc40bc6332',
  'wpp2024/KP/births': '10651ef45aa79ecd78e98693adfee1b0',
  'wpp2024/KP/qx': '9166f9393289362b3f0c84d3f1b0daac',
  'wdi/KP/urban-share': '20899c410734522bedd6258818056e78',
  'wpp2024/KR/births': '339d61731087ae2d568ce063275523ed',
  'wpp2024/KR/qx': '5b61a49df895ca9bfd9460aa496bf9ee',
  'wdi/KR/urban-share': '9891842ba0c4415b3114eb49b5e47a91',
  'wpp2024/RU/births': '4e20fc1b20cc32f5577955e725ebae12',
  'wpp2024/RU/qx': '90289d5a9443047d69b8f9701274e239',
  'wdi/RU/urban-share': 'a8c0bd6e75233959ed63756ed28aeacb',
};
