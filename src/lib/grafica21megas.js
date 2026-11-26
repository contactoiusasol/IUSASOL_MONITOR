import { getFarmMeterProfiles, getToday } from './api/endpoints';

export const megaIds = [
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURoPlIMgd9PF_hdg9svnATlk",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURpXm2c-VQBeK_s05Wb4IqGL",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURr9lsFj1WUCyxscRAMrzD9T",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURrgUNTYRX9XOSJXKUVKmVM9",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURr95Wg81Un44wKngWWnLb3Q",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURq-Bby7KqfdJ1nMZc3cbaI4",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURor5FX_1QZk-EQYiSzeHFif",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURq7bpgzxPAnMXXTKGX9e3ON",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURoNJXkC2IuQCeKr5Wvm8PH_",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURpfCDdXqBWi_kTt-HlLH517",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURqCNz8NP9-wQiPRi-l2LyKw",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURqB55FNn8_wITSmcmyUhE1p",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURqZV8klUt1yARO0rKz7AFu0",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURocRDqTjJCnBYVDbrBDqJdf",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURrjntPx7ZCPgdM4QI3n4RCw",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURo8j4evZ58OKsj-Lktb28e0",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURrNZfknBsxoibC-9dZ6o3gE",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURoZA6xFeZZh72NyKtGvj_oa",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURoMjZLEgvi7noC0H19YfLVL",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURrvepQJPEBaKXzNScqK_J_R",
    "1yhkHn92S_uK8n65m9mfVLpgeX7vuCn-3NzLrz1cURqcb6WDHglD-W7OyNJZ6xfQ"
];

const toDateString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Perfiles diarios de las 21 megas.
 * @param {string|Date} [dateParam] - Fecha a consultar; si se omite usa la
 *   fecha del SERVIDOR (Server/date), no la del navegador.
 * @returns {Promise<Array<Array>>} un array de profiles por mega. Las megas
 *   que fallen devuelven [] en lugar de tumbar toda la carga.
 */
export const getDataForAllMegas = async (dateParam) => {
  let fechaSeleccionada;
  if (dateParam instanceof Date) {
    fechaSeleccionada = toDateString(dateParam);
  } else if (typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    fechaSeleccionada = dateParam;
  } else if (dateParam) {
    fechaSeleccionada = toDateString(new Date(dateParam));
  } else {
    fechaSeleccionada = await getToday();
  }

  const settled = await Promise.allSettled(
    megaIds.map((id) => getFarmMeterProfiles({ id, date: fechaSeleccionada }))
  );

  return settled.map((s) =>
    s.status === 'fulfilled' && s.value && s.value.profiles ? s.value.profiles : []
  );
};
