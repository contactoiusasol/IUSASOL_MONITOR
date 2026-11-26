import { getPorteoMeters } from './api/endpoints';

const comp_any = 'IUSASOL SUMINISTRADORA ENERGIA';

export default async function fetchPorteoMeters() {
  try {
    const data = await getPorteoMeters(comp_any);
    return data && data.meters ? data.meters : [];
  } catch (err) {
    console.error('Error en la solicitud => ', err);
    throw err;
  }
}
