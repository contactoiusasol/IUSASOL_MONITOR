import { getMeters } from './api/endpoints';

const comp_any = 'IUSASOL SUMINISTRADORA ENERGIA';

export default async function fetchMeters() {
  try {
    const data = await getMeters(comp_any);
    return data && data.meters ? data.meters : [];
  } catch (error) {
    console.error('Error en la solicitud => ', error);
    throw error;
  }
}
