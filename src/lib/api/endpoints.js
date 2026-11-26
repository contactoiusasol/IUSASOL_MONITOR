import { apiGet } from './client';

/**
 * Endpoints de la API IUSASOL v2.1 con sus parámetros por defecto.
 * Cada función replica exactamente los parámetros que la app usaba
 * antes (company, tym, tye) para no cambiar el comportamiento.
 */

/** Company que usa la app cuando el endpoint la acepta. */
export const DEFAULT_COMPANY = 'IUSASOL SUMINISTRADORA ENERGIA';

/** Enums documentados por la API. */
export const TYE_ENERGY = 'E'; // 'E' Energía | 'P' Potencia
export const TYM_KWH = '2'; // MeasuringValue.kWh
export const PERIODICITY_DAILY = 0; // Daily | Weekly | Monthly | Yearly

/** Medidores de clientes (ISOL). company opcional: sin ella usa la default de la API. */
export const getMeters = (company) =>
  apiGet('Reports/ISOL/Meters', company ? { company } : {});

/** Perfiles detallados por medidor (5 min). company opcional. */
export const getProfilesDetailed = (
  { id, beginDate, endDate, tym = TYM_KWH, tye = TYE_ENERGY, company },
  opts = {}
) =>
  apiGet(
    'Reports/ISOL/Profiles/Detailed',
    {
      id,
      beginDate,
      endDate,
      tym,
      tye,
      ...(company ? { company } : {}),
    },
    opts
  );

/** Contratos activos. company opcional. */
export const getContracts = (company) =>
  apiGet('Reports/ISOL/Contracts', company ? { company } : {});

/** Detalle de un contrato (medidores). */
export const getContract = (id) => apiGet('Reports/ISOL/Contract', { id });

/** Medidores de porteo. company opcional. */
export const getPorteoMeters = (company) =>
  apiGet('Reports/Porteo/Meters', company ? { company } : {});

/** Perfiles de un medidor de granja (21 megas). */
export const getFarmMeterProfiles = ({ id, date, periodicity = PERIODICITY_DAILY }) =>
  apiGet('Reports/Farm/Meter/Profiles', { id, date, periodicity });

/** Fecha y hora del servidor (evita depender de la zona horaria del navegador). */
export const getServerDate = async () => {
  const data = await apiGet('Server/date');
  return (data && data.server && data.server.date) || null;
};

/** Hoy en YYYY-MM-DD según el servidor; si falla, la fecha local. */
export const getToday = async () => {
  try {
    const iso = await getServerDate();
    if (iso) return String(iso).slice(0, 10);
  } catch (_) {
    // fallback local
  }
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};
