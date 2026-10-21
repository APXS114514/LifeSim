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
  'wdi/CN/education-enrollment-secondary': '207240e845cf03c3be27a5fe6685bed1',
  'wdi/CN/labor-force-participation': 'f85c3a2f911a1976eb10ea7c5fe8bd94',
  'wdi/CN/employment-agriculture-share': '1ed9a0b005c1df40fa013c2b4b693c36',
  'wdi/CN/education-completion-upper-secondary': '0402b770bbe22b2705159b593910b77b',
  'wpp2024/JP/births': 'ef888f2f344be20088c0438e7ed95adc',
  'wpp2024/JP/qx': 'b806b29563338a8354036f103d21f9f5',
  'wdi/JP/urban-share': '2a5e15865694928507ec5fdc40bc6332',
  'wdi/JP/education-enrollment-secondary': '8b7422acc189fb73b5bab2b79765bf67',
  'wdi/JP/labor-force-participation': '9e6fdb167f5548d3a6e9920d2e81b29e',
  'wdi/JP/employment-agriculture-share': '2d80e7325dcd9dade1d460f8d46ecc4f',
  'wdi/JP/education-completion-upper-secondary': 'b35bc3c97e17049f21de27df5009d707',
  'wpp2024/KP/births': '10651ef45aa79ecd78e98693adfee1b0',
  'wpp2024/KP/qx': '9166f9393289362b3f0c84d3f1b0daac',
  'wdi/KP/urban-share': '20899c410734522bedd6258818056e78',
  'wdi/KP/education-enrollment-secondary': 'f2260fb516990f1097074264f2cad6a5',
  'wdi/KP/labor-force-participation': 'c3c186892c8c25020f74e0df98ac15ab',
  'wdi/KP/employment-agriculture-share': '3b008e38954d189d8383c1c784e470a3',
  'wpp2024/KR/births': '339d61731087ae2d568ce063275523ed',
  'wpp2024/KR/qx': '5b61a49df895ca9bfd9460aa496bf9ee',
  'wdi/KR/urban-share': '9891842ba0c4415b3114eb49b5e47a91',
  'wdi/KR/education-enrollment-secondary': '826fc46c0c076289288b2f745ed37833',
  'wdi/KR/labor-force-participation': 'd9c4714a97ea396108455e699e99527a',
  'wdi/KR/employment-agriculture-share': '70ddc766e5425a3f25d3ed78aa6dca17',
  'wdi/KR/education-completion-upper-secondary': 'c3517784adec0ebd52a25feaba1670bc',
  'wpp2024/RU/births': '4e20fc1b20cc32f5577955e725ebae12',
  'wpp2024/RU/qx': '90289d5a9443047d69b8f9701274e239',
  'wdi/RU/urban-share': 'a8c0bd6e75233959ed63756ed28aeacb',
  'wdi/RU/education-enrollment-secondary': 'f599b25e390ab037be2b07ce1a8181e3',
  'wdi/RU/labor-force-participation': 'db59cc85f946e2d9964311fc4438461f',
  'wdi/RU/employment-agriculture-share': '1fa98d5fd90fa7b5f2ac5ccad02f11f5',
  'wdi/RU/education-completion-upper-secondary': 'b36aad01158e162bf17470241f2e8002',
};
