import axios from 'axios';
import * as XLSX from 'xlsx';
import { TOKEN } from 'src/config/token';

const urlBase = 'https://api.iusasol.mx/v2.1/api/Reports/ISOL/Meters';
const comp_any = "IUSASOL SUMINISTRADORA ENERGIA";

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Origin': 'https://api.iusasol.mx',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache'
};

async function leerExcel(file) {
  try {
    let data;

    if (file instanceof File) {
      data = await file.arrayBuffer();
    } else {
      // try to fetch the file from public folder
      const response = await fetch('/listadoSFV.xlsx');
      if (!response.ok) {
        throw new Error(`Error al cargar el archivo: ${response.statusText}`);
      }
      data = await response.arrayBuffer();
    }

    const workbook = XLSX.read(data);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const datos = jsonData.slice(1).map((row) => ({
      serial: row[0] ? row[0].toString().trim() : '',
      segundoValor: row[1] || '',
      tercerValor: row[2] || '',
      cuartoValor: row[3] || '',
      quintoValor: row[4] || ''
    }));

    return datos;
  } catch (error) {
    // don't throw, return empty array so callers can handle gracefully
    console.error('Error al leer el archivo Excel:', error);
    return [];
  }
}

async function obtenerGenera(idcode, fecha) {
  const urlGenera = `https://api.iusasol.mx/v2.1/api/Reports/ISOL/Profiles/Detailed?id=${idcode}&beginDate=${fecha}&endDate=${fecha}&tym=2&tye=E`;

  try {
    const response = await axios.get(urlGenera, { headers });
    const profiles = response.data.profiles || [];

    const sumaGenera = profiles.reduce((sum, profile) => {
      return sum + (profile.values && profile.values.genera ? profile.values.genera : 0);
    }, 0);

    return sumaGenera;
  } catch (error) {
    console.error(`Error al obtener datos para IDCode ${idcode} en fecha ${fecha}:`, error);
    return 0;
  }
}

/**
 * Obtiene los datos combinando el listado del Excel y la API de medidores.
 * @param {string} fecha - Fecha en formato YYYY/MM/DD
 * @param {File} [file] - Opcional: File de Excel seleccionado por el usuario
 * @returns {Array} filas con { serial, idcode, usuario, noDeModulos, genera, resultado, tipoSistema, tipoLectura, color }
 */
async function obtenerDatos(fecha, file) {
  const params = { company: comp_any };

  try {
    const res = await axios.get(urlBase, { params, headers });
    const meters = res.data.meters || [];
    const datosReferencias = await leerExcel(file);

    const rows = [];

    for (const { serial, segundoValor, tercerValor, cuartoValor, quintoValor } of datosReferencias) {
      const isSpecialSerial = ['sinmedidor', 'procesodeinterconexion'].includes(serial.toLowerCase());

      let idcode = '';
      let sumaGenera = 0;

      if (!isSpecialSerial) {
        const meter = meters.find((m) => m.serial && m.serial.trim() === serial);
        idcode = meter ? meter.idcode || '' : '';

        if (idcode) {
          sumaGenera = await obtenerGenera(idcode, fecha);
        }
      } else {
        sumaGenera = 0;
      }

      const resultado = tercerValor && !isNaN(tercerValor) ? sumaGenera / tercerValor : 0;

      let color = 'transparent';
      if (resultado === 0) {
        color = 'red';
      } else if (resultado > 0 && resultado <= 0.5) {
        color = 'yellow';
      } else if (resultado > 0.5 && resultado <= 1.5) {
        color = 'green';
      } else {
        color = 'blue';
      }

      rows.push({
        serial,
        idcode,
        usuario: segundoValor,
        noDeModulos: tercerValor,
        genera: Number(sumaGenera),
        resultado: Number(resultado),
        tipoSistema: cuartoValor,
        tipoLectura: quintoValor,
        color
      });
    }

    return rows;
  } catch (error) {
    console.error('Error en la solicitud => ', error);
    throw error;
  }
}

/**
 * Streamed version of obtenerDatos: yields each fila a medida que se obtiene
 * Useful for progressive rendering in the UI so rows appear conforme llegan
 */
async function* obtenerDatosStream(fecha, file) {
  const params = { company: comp_any };

  try {
    const res = await axios.get(urlBase, { params, headers });
    const meters = res.data.meters || [];
    const datosReferencias = await leerExcel(file);

    for (const { serial, segundoValor, tercerValor, cuartoValor, quintoValor } of datosReferencias) {
      const isSpecialSerial = ['sinmedidor', 'procesodeinterconexion'].includes(serial.toLowerCase());

      let idcode = '';
      let sumaGenera = 0;

      if (!isSpecialSerial) {
        const meter = meters.find((m) => m.serial && m.serial.trim() === serial);
        idcode = meter ? meter.idcode || '' : '';

        if (idcode) {
          sumaGenera = await obtenerGenera(idcode, fecha);
        }
      } else {
        sumaGenera = 0;
      }

      const resultado = tercerValor && !isNaN(tercerValor) ? sumaGenera / tercerValor : 0;

      let color = 'transparent';
      if (resultado === 0) {
        color = 'red';
      } else if (resultado > 0 && resultado <= 0.5) {
        color = 'yellow';
      } else if (resultado > 0.5 && resultado <= 1.5) {
        color = 'green';
      } else {
        color = 'blue';
      }

      const row = {
        serial,
        idcode,
        usuario: segundoValor,
        noDeModulos: tercerValor,
        genera: Number(sumaGenera),
        resultado: Number(resultado),
        tipoSistema: cuartoValor,
        tipoLectura: quintoValor,
        color
      };

      // yield each row as it's ready
      yield row;
    }
  } catch (error) {
    console.error('Error en la solicitud (stream) => ', error);
    throw error;
  }
}

export default {
  leerExcel,
  obtenerGenera,
  obtenerDatos,
  obtenerDatosStream
};
