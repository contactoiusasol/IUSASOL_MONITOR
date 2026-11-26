import * as XLSX from 'xlsx';
import { getMeters, getProfilesDetailed } from './api/endpoints';
import { fetchDato } from './datos';

// Endpoints - usando URL directa como en idmedidores.js
const comp_any = 'IUSASOL SUMINISTRADORA ENERGIA';
const MeasuringValue = '2';  // Para generación
const MeasuringType = 'E';   // Energía

/**
 * Lee el archivo Excel de facturacion desde el servidor protegido
 * @returns {Promise<Array>} Array de objetos con los datos del Excel
 */
export async function leerExcel() {
  try {
    // Se lee desde /api/datos.php (requiere sesion valida)
    const response = await fetchDato('ListadoFacturacion.xlsx');
    const arrayBuffer = await response.arrayBuffer();
    
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length < 2) {
      console.warn('Excel file has no data rows');
      return [];
    }
    
    // First row is headers
    const headersRow = jsonData[0];
    
    // Map column names to indices
    const columnMap = {};
    headersRow.forEach((header, index) => {
      if (header) {
        columnMap[header.toString().trim()] = index;
      }
    });
    
    console.log('Excel columns found:', columnMap);
    
    // Función para limpiar valores monetarios (quitar $, comas, espacios)
    const limpiarNumero = (valor) => {
      if (typeof valor === 'number') return valor;
      if (!valor) return 0;
      // Quitar $, comas, espacios y convertir a número
      const limpio = String(valor).replace(/[$,\s]/g, '');
      return parseFloat(limpio) || 0;
    };

    // Función para limpiar descuentos (quitar %, espacios)
    const limpiarDescuento = (valor) => {
      if (typeof valor === 'number') return valor;
      if (!valor) return 0;
      // Quitar %, espacios
      const limpio = String(valor).replace(/[%\s]/g, '');
      return parseFloat(limpio) || 0;
    };
    
    // Process data rows
    const data = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;
      
      const item = {
        numero: row[columnMap['No']] || '',
        clienteIUSASOL: row[columnMap['Cliente IUSASOL']] || '',
        cliente: row[columnMap['Cliente']] || '',
        direccion: row[columnMap['Dirección']] || '',
        contratoSAP: row[columnMap['Contrato SAP']] || '',
        medidor: row[columnMap['Medidor']] || '',
        nombreTarifa: row[columnMap['Nombre Tarifa']] || '',
        descuento: limpiarDescuento(row[columnMap['Descuento']]),
        tarifaCFE: limpiarNumero(row[columnMap['Tarifa CFE']]),
        tarifaIUSASOL: limpiarNumero(row[columnMap['Tarifa IUSASOL']])
      };
      
      if (item.medidor) {
        data.push(item);
      }
    }
    
    console.log(`Loaded ${data.length} records from Excel`);
    return data;
  } catch (error) {
    console.error('Error reading Excel file:', error);
    throw error;
  }
}

/**
 * Obtiene todos los medidores con sus IDcodes desde la API
 * @returns {Promise<Array>} Array de medidores con serial e idcode
 */
export async function obtenerTodosMedidores() {
  try {
    const data = await getMeters(comp_any);
    const meters = data && data.meters ? data.meters : [];
    console.log(`Obtenidos ${meters.length} medidores con IDcodes`);
    return meters;
  } catch (error) {
    console.error('Error fetching medidores:', error);
    throw error;
  }
}

/**
 * Obtiene los perfiles de generación para un IDcode específico en un rango de fechas
 * @param {string} idcode - IDcode del medidor
 * @param {string} fechaInicio - Fecha de inicio (YYYY-MM-DD)
 * @param {string} fechaFin - Fecha de fin (YYYY-MM-DD)
 * @returns {Promise<Array>} Array de perfiles
 */
export async function obtenerGeneracionPorPeriodo(idcode, fechaInicio, fechaFin) {
  try {
    console.log(`Fetching profiles for idcode: ${idcode}, dates: ${fechaInicio} to ${fechaFin}`);
    const data = await getProfilesDetailed({
      id: idcode,
      beginDate: fechaInicio,
      endDate: fechaFin,
      tym: MeasuringValue,
      tye: MeasuringType,
      company: comp_any
    });

    const profiles = data && data.profiles ? data.profiles : [];
    console.log(`Profiles obtenidos para ${idcode}:`, profiles.length);
    
    return profiles;
  } catch (error) {
    console.error(`Error fetching generation for idcode ${idcode}:`, error);
    return [];
  }
}

/**
 * Calcula la generación total acumulada desde un array de perfiles
 * @param {Array} profiles - Array de perfiles
 * @returns {number} Generación total en kWh
 */
export function calcularGeneracionTotal(profiles) {
  if (!profiles || profiles.length === 0) return 0;
  
  let totalGenera = 0;
  
  profiles.forEach(profile => {
    if (profile.values && profile.values.genera !== undefined) {
      totalGenera += parseFloat(profile.values.genera) || 0;
    }
  });
  
  return totalGenera;
}

/**
 * Obtiene los datos de facturación completos para todos los clientes
 * @param {Array} excelData - Datos del Excel
 * @param {string} fechaInicio - Fecha de inicio
 * @param {string} fechaFin - Fecha de fin
 * @returns {Promise<Array>} Array con datos de facturación
 */
export async function obtenerDatosFacturacion(excelData, fechaInicio, fechaFin) {
  try {
    console.log('Iniciando obtención de datos de facturación...');
    console.log('Fecha inicio:', fechaInicio, 'Fecha fin:', fechaFin);
    console.log('Registros en Excel:', excelData.length);
    
    // 1. Obtener todos los medidores con sus IDcodes
    const todosMedidores = await obtenerTodosMedidores();
    console.log('Total medidores obtenidos de API:', todosMedidores.length);
    
    // 2. Crear un mapa de serial -> idcode
    const serialToIdcode = {};
    todosMedidores.forEach(m => {
      if (m.serial && m.idcode) {
        // Limpiar el serial (quitar espacios extras)
        const serialLimpio = m.serial.trim();
        serialToIdcode[serialLimpio] = m.idcode;
      }
    });
    
    console.log('Mapeo serial -> idcode creado');
    
    // 3. Para cada registro del Excel, buscar el IDcode y obtener la generación
    const facturacionData = [];
    
    for (let i = 0; i < excelData.length; i++) {
      const item = excelData[i];
      
      // Limpiar el medidor del Excel
      const medidorLimpio = item.medidor ? item.medidor.trim() : '';
      
      // Buscar el IDcode
      let idcode = serialToIdcode[medidorLimpio];
      
      // Si no encuentra directamente, buscar con coincidencias parciales
      if (!idcode) {
        for (const [serial, code] of Object.entries(serialToIdcode)) {
          if (medidorLimpio.includes(serial) || serial.includes(medidorLimpio)) {
            idcode = code;
            break;
          }
        }
      }
      
      let genera = 0;
      
      if (idcode) {
        console.log(`Procesando medidor: ${medidorLimpio}, IDCode: ${idcode}`);
        
        // Obtener los perfiles de generación
        const profiles = await obtenerGeneracionPorPeriodo(idcode, fechaInicio, fechaFin);
        
        // Calcular la generación total
        genera = calcularGeneracionTotal(profiles);
        console.log(`Generación calculada para ${medidorLimpio}: ${genera} kWh`);
      } else {
        console.warn(`No se encontró IDcode para medidor: ${medidorLimpio}`);
      }
      
      facturacionData.push({
        ...item,
        idcode: idcode || '',
        genera: genera,
        generacionNeta: genera
      });
    }
    
    console.log('Final facturacionData:', facturacionData);
    return facturacionData;
  } catch (error) {
    console.error('Error obtaining billing data:', error);
    throw error;
  }
}

/**
 * Versión optimizada que procesa en lotes para evitar sobrecargar la API
 * @param {Array} excelData - Datos del Excel
 * @param {string} fechaInicio - Fecha de inicio
 * @param {string} fechaFin - Fecha de fin
 * @param {Function} onProgress - Callback para progreso
 * @returns {Promise<Array>} Array con datos de facturación
 */
export async function obtenerDatosFacturacionOptimizado(excelData, fechaInicio, fechaFin, onProgress) {
  try {
    console.log('Iniciando obtención de datos de facturación (optimizado)...');
    
    // 1. Obtener todos los medidores con sus IDcodes
    const todosMedidores = await obtenerTodosMedidores();
    
    // 2. Crear un mapa de serial -> idcode
    const serialToIdcode = {};
    todosMedidores.forEach(m => {
      if (m.serial && m.idcode) {
        const serialLimpio = m.serial.trim();
        serialToIdcode[serialLimpio] = m.idcode;
      }
    });
    
    const results = [];
    const batchSize = 5; // Procesar de 5 en 5 para no saturar la API
    
    for (let i = 0; i < excelData.length; i += batchSize) {
      const batch = excelData.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (item) => {
        const medidorLimpio = item.medidor ? item.medidor.trim() : '';
        
        let idcode = serialToIdcode[medidorLimpio];
        
        if (!idcode) {
          for (const [serial, code] of Object.entries(serialToIdcode)) {
            if (medidorLimpio.includes(serial) || serial.includes(medidorLimpio)) {
              idcode = code;
              break;
            }
          }
        }
        
        let genera = 0;
        
        if (idcode) {
          const profiles = await obtenerGeneracionPorPeriodo(idcode, fechaInicio, fechaFin);
          genera = calcularGeneracionTotal(profiles);
        }
        
        return {
          ...item,
          idcode: idcode || '',
          genera: genera,
          generacionNeta: genera
        };
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (onProgress) {
        onProgress(Math.min(i + batchSize, excelData.length), excelData.length);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error obtaining billing data:', error);
    throw error;
  }
}