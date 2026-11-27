import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { 
  Box, 
  Container, 
  Typography, 
  Card, 
  Grid, 
  TextField, 
  Button, 
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Pagination,
  CircularProgress,
  LinearProgress,
  Alert
} from '@mui/material';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import { leerExcel, obtenerDatosFacturacion, obtenerTodosMedidores, obtenerGeneracionPorPeriodo, calcularGeneracionTotal } from 'src/lib/facturacion';
import { ReciboPDF } from 'src/components/recibo-pdf';
import { useNotify } from 'src/components/notify';

export default function FacturacionPage() {
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  // Medidores repetidos en el Excel: detalle para saber a quién pertenecen
  const [repetidos, setRepetidos] = useState([]);
  const [verDetalleRepetidos, setVerDetalleRepetidos] = useState(false);

  // Función para obtener decimales según el tipo de tarifa
  const getDecimalesTarifa = (nombreTarifa) => {
    if (!nombreTarifa) return 4;
    
    const tarifa = nombreTarifa.toUpperCase();
    
    // Tarifas con 3 decimales
    const tarifas3Decimales = [
      'PDBT CENTRO SUR',
      'PDBT VALLE DE MÉXICO CENTRO',
      'PDBT VALLE DE MÉXICO NORTE',
      'PDBT VALLE DE MÉXICO SUR',
      'DAC CENTRAL',
      'DAC SUR',
      'PDBT CENTRO ORIENTE',
      '1B SUR',
      '1A CENTRAL',
      '1 CENTRAL'
    ];
    
    // Tarifas con 4 decimales
    const tarifas4Decimales = [
      'GDMTO VALLE DE MÉXICO SUR',
      'GDMTO ORIENTE',
      'GDMTO VALLE DE MÉXICO CENTRO',
      'GDMTO VALLE DE MÉXICO NORTE'
    ];
    
    if (tarifas3Decimales.some(t => tarifa.includes(t))) {
      return 3;
    }
    if (tarifas4Decimales.some(t => tarifa.includes(t))) {
      return 4;
    }
    
    return 4; // Por defecto 4 decimales
  };

  // Función para calcular los datos del recibo
  const getReciboData = (item) => {
    // 1. Redondear generación: >= 0.5 decimales al entero superior, < 0.5 al inferior
    const totalPeriodoRaw = item.genera || 0;
    const decimalPart = totalPeriodoRaw - Math.floor(totalPeriodoRaw);
    const totalPeriodo = decimalPart >= 0.5 ? Math.ceil(totalPeriodoRaw) : Math.floor(totalPeriodoRaw);
    
    // 2. Tarifa CFE
    const tarifaCFE = item.tarifaCFE || 0;
    
    // 3. Descuento - puede venir como porcentaje (10) o decimal (0.10)
    // Si es mayor a 1, asumimos que es porcentaje y lo convertimos a decimal
    let descuento = item.descuento || 0;
    if (descuento > 1) {
      descuento = descuento / 100;
    }
    
    // Obtener decimales según el tipo de tarifa
    const decimales = getDecimalesTarifa(item.nombreTarifa);
    
    // 4. Tarifa IUSASOL = Tarifa CFE - (Tarifa CFE * descuento) = Tarifa CFE * (1 - descuento)
    const tarifaIUSASOL = parseFloat((tarifaCFE * (1 - descuento)).toFixed(decimales));
    
    // 5. Subtotal: totalPeriodo * Tarifa IUSASOL
    const subtotal = parseFloat((totalPeriodo * tarifaIUSASOL).toFixed(4));
    
    // 6. IVA: 16% del subtotal
    const iva = parseFloat((subtotal * 0.16).toFixed(2));
    
    // 7. Facturación total del periodo: subtotal + IVA
    const facturacionTotal = parseFloat((subtotal + iva).toFixed(2));
    
    return {
      cliente: item.cliente,
      direccion: item.direccion || '',
      medidor: item.medidor,
      periodo: `${fechaInicio} – ${fechaFin}`,
      totalPeriodo: totalPeriodo,
      tarifaCFE: tarifaCFE,
      descuento: `${(descuento * 100).toFixed(0)}%`,
      tarifaIUSASOL: tarifaIUSASOL,
      subtotal: subtotal.toFixed(2),
      iva: iva.toFixed(2),
      total: facturacionTotal.toFixed(2),
      fechaLimite: '',
      tarifa: item.nombreTarifa || '',
      contratoSAP: item.contratoSAP || ''
    };
  };

  // Calcular totales usando la misma lógica de getReciboData
  const totales = useMemo(() => {
    return data.reduce((acc, item) => {
      const reciboData = getReciboData(item);
      return {
        genera: acc.genera + (reciboData.totalPeriodo || 0),
        generacionNeta: acc.generacionNeta + (reciboData.totalPeriodo || 0),
        monto: acc.monto + parseFloat(reciboData.total || 0)
      };
    }, { genera: 0, generacionNeta: 0, monto: 0 });
  }, [data, fechaInicio, fechaFin]);

  const handleConsultar = async () => {
    if (!fechaInicio || !fechaFin) {
      setError('Por favor seleccione las fechas de inicio y fin');
      return;
    }

    setLoading(true);
    setError(null);
    setData([]);
    setRepetidos([]);
    setVerDetalleRepetidos(false);

    try {
      // Leer Excel
      const excelData = await leerExcel();
      if (!excelData || excelData.length === 0) {
        setError('No se encontraron datos en el archivo Excel');
        setLoading(false);
        return;
      }

      // Detectar medidores repetidos: sin alert(), se guarda el detalle
      // (filas, clientes y motivo) y se muestra en un panel desplegable.
      const porMedidor = {};
      excelData.forEach((item, idx) => {
        if (!item.medidor) return;
        const partes = item.medidor.split('/').map((m) => m.trim()).filter(Boolean);
        partes.forEach((med) => {
          if (!porMedidor[med]) porMedidor[med] = [];
          porMedidor[med].push({
            numero: item.numero || idx + 1,
            cliente: item.cliente || '',
            clienteIUSASOL: item.clienteIUSASOL || '',
            contratoSAP: item.contratoSAP || '',
            campo: item.medidor,
            multipar: partes.length > 1
          });
        });
      });

      const repetidas = Object.entries(porMedidor)
        .filter(([, filas]) => filas.length > 1)
        .map(([medidor, filas]) => {
          const clientes = [...new Set(filas.map((f) => f.cliente).filter(Boolean))];
          const motivos = [];
          if (clientes.length === 0) motivos.push('filas repetidas sin cliente');
          else if (clientes.length === 1) motivos.push(`mismo cliente: ${clientes[0]}`);
          else motivos.push(`${clientes.length} clientes distintos con el mismo medidor`);
          if (filas.some((f) => f.multipar)) motivos.push('viene de un campo con varios medidores separados por "/"');
          return { medidor, veces: filas.length, filas, motivo: motivos.join(' · ') };
        })
        .sort((a, b) => b.veces - a.veces);

      setRepetidos(repetidas);
      if (repetidas.length > 0) {
        notify(
          `Se detectaron ${repetidas.length} medidor(es) repetido(s) en el Excel — revisa el detalle`,
          'warning'
        );
      }

      // Obtener todos los medidores con sus IDcodes
      const todosMedidores = await obtenerTodosMedidores();
      const serialToIdcode = {};
      todosMedidores.forEach(m => {
        if (m.serial && m.idcode) {
          const serialLimpio = m.serial.trim();
          serialToIdcode[serialLimpio] = m.idcode;
        }
      });

      // Procesar cada registro progresivamente
      const facturacionData = [];
      setProgress({ current: 0, total: excelData.length });

      for (let i = 0; i < excelData.length; i++) {
        const item = excelData[i];
        let genera = 0;
        let idcodes = [];
        let medidores = [];
        if (item.medidor) {
          medidores = item.medidor.split('/').map(m => m.trim());
          // Buscar todos los idcodes
          idcodes = medidores.map(med => {
            let idcode = serialToIdcode[med];
            if (!idcode) {
              for (const [serial, code] of Object.entries(serialToIdcode)) {
                if (med.includes(serial) || serial.includes(med)) {
                  idcode = code;
                  break;
                }
              }
            }
            return idcode;
          }).filter(Boolean);
        }
        // Sumar generación de todos los medidores
        for (const idcode of idcodes) {
          if (idcode) {
            const profiles = await obtenerGeneracionPorPeriodo(idcode, fechaInicio, fechaFin);
            genera += calcularGeneracionTotal(profiles);
          }
        }
        // Mantener SIEMPRE los datos originales de la fila del Excel
        const itemConGeneracion = {
          numero: item.numero,
          clienteIUSASOL: item.clienteIUSASOL,
          cliente: item.cliente,
          direccion: item.direccion,
          contratoSAP: item.contratoSAP,
          medidor: item.medidor,
          nombreTarifa: item.nombreTarifa,
          descuento: item.descuento,
          tarifaCFE: item.tarifaCFE,
          tarifaIUSASOL: item.tarifaIUSASOL,
          idcode: idcodes.join('/'),
          genera: genera,
          generacionNeta: genera
        };
        facturacionData.push(itemConGeneracion);
        setData([...facturacionData]);
        setProgress({ current: i + 1, total: excelData.length });
      }
      setPage(1);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Error al obtener los datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Exporta el detalle de medidores repetidos (medidor, veces, filas y motivo)
  const exportarDetalleRepetidos = () => {
    if (repetidos.length === 0) return;
    const headers = ['Medidor', 'Veces', 'No', 'Cliente IUSASOL', 'Cliente', 'Contrato SAP', 'Campo original', 'Motivo'];
    const rows = [];
    repetidos.forEach((r) => {
      r.filas.forEach((f) => {
        rows.push([r.medidor, r.veces, f.numero, f.clienteIUSASOL, f.cliente, f.contratoSAP, f.campo, r.motivo]);
      });
    });
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((c) => `"${String(c ?? '')}"`).join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'medidores_repetidos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('Detalle de medidores repetidos exportado', 'success');
  };

  const handleExportCsv = () => {
    if (data.length === 0) return;
    const headers = [
      'No', 'Cliente IUSASOL', 'Cliente', 'Dirección', 'Contrato SAP', 
      'Medidor', 'Nombre Tarifa', 'Descuento', 'Tarifa CFE', 'Tarifa IUSASOL',
      'Generación', 'Subtotal', 'IVA', 'Total'
    ];

    const rows = data.map(item => {
      const reciboData = getReciboData(item);
      // Obtener decimales para Tarifa IUSASOL según el tipo de tarifa
      const decimales = getDecimalesTarifa(item.nombreTarifa);
      const tarifaIUSASOLFormateada = parseFloat((item.tarifaCFE * (1 - (item.descuento > 1 ? item.descuento / 100 : item.descuento))).toFixed(decimales));
      return [
        item.numero,
        item.clienteIUSASOL,
        item.cliente,
        item.direccion,
        item.contratoSAP,
        item.medidor,
        item.nombreTarifa,
        item.descuento,
        item.tarifaCFE,
        tarifaIUSASOLFormateada,
        reciboData.totalPeriodo,
        reciboData.subtotal,
        reciboData.iva,
        reciboData.total
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `facturacion_${fechaInicio}_${fechaFin}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('CSV exportado correctamente', 'success');
  };

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  return (
    <>
      <Helmet>
        <title>Facturación | IUSASOL</title>
      </Helmet>
      <Box sx={{ flexGrow: 1, py: 8 }}>
        <Container maxWidth="xl">
          <Stack spacing={3}>
            <div>
              <Typography variant="h4" component="h1">
                Facturación
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Consulta y genera recibos de facturación para clientes
              </Typography>
            </div>

            <Card sx={{ p: 3 }}>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Fecha Inicio"
                    type="date"
                    fullWidth
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Fecha Fin"
                    type="date"
                    fullWidth
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Button 
                    variant="contained" 
                    onClick={handleConsultar}
                    disabled={loading}
                    fullWidth
                    size="large"
                  >
                    {loading ? 'Consultando...' : 'Consultar'}
                  </Button>
                </Grid>
              </Grid>
            </Card>

            {error && (
              <Alert severity="error">{error}</Alert>
            )}

            {repetidos.length > 0 && (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => setVerDetalleRepetidos((v) => !v)}
                  >
                    {verDetalleRepetidos ? 'Ocultar detalle' : `Ver detalle (${repetidos.length})`}
                  </Button>
                }
              >
                Se detectaron {repetidos.length} medidor(es) repetido(s) en el Excel.
                {verDetalleRepetidos ? '' : ' Revisa a qué clientes pertenecen.'}
              </Alert>
            )}

            {repetidos.length > 0 && verDetalleRepetidos && (
              <Card sx={{ p: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={1}>
                  <Typography variant="h6">
                    Medidores repetidos — a quién pertenecen
                  </Typography>
                  <Button size="small" variant="outlined" onClick={exportarDetalleRepetidos}>
                    Exportar detalle CSV
                  </Button>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Medidor</TableCell>
                        <TableCell align="center">Veces</TableCell>
                        <TableCell>Filas del Excel (No. — Cliente — Contrato SAP)</TableCell>
                        <TableCell>Posible motivo</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {repetidos.map((r) => (
                        <TableRow key={r.medidor}>
                          <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {r.medidor}
                          </TableCell>
                          <TableCell align="center">{r.veces}</TableCell>
                          <TableCell>
                            {r.filas.map((f, i) => (
                              <Typography key={i} variant="body2">
                                #{f.numero} — {f.clienteIUSASOL || f.cliente || '(sin cliente)'}
                                {f.contratoSAP ? ` (SAP ${f.contratoSAP})` : ''}
                              </Typography>
                            ))}
                          </TableCell>
                          <TableCell>{r.motivo}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            )}

            {loading && (
              <Card sx={{ p: 3 }}>
                <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                  <CircularProgress />
                  <Typography variant="body1">
                    Consultando datos de generación...
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {progress.current} de {progress.total} registros procesados
                  </Typography>
                  <Box width="100%" maxWidth={400}>
                    <LinearProgress variant="determinate" value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
                  </Box>
                </Box>
              </Card>
            )}

            {data.length > 0 && !loading && (
              <>
                <Card sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                    <Typography variant="h6">
                      Total: {data.length} registros
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <Button variant="outlined" onClick={handleExportCsv}>
                        Exportar CSV
                      </Button>
                    </Stack>
                  </Box>
                </Card>

                <Card>
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>No</TableCell>
                          <TableCell>Cliente IUSASOL</TableCell>
                          <TableCell>Cliente</TableCell>
                          <TableCell>Dirección</TableCell>
                          <TableCell>Contrato SAP</TableCell>
                          <TableCell>Medidor</TableCell>
                          <TableCell>Tarifa</TableCell>
                          <TableCell align="right">Descuento</TableCell>
                          <TableCell align="right">Tarifa CFE</TableCell>
                          <TableCell align="right">Tarifa IUSASOL</TableCell>
                          <TableCell align="right">Generación (kWh)</TableCell>
                          <TableCell align="right">Subtotal</TableCell>
                          <TableCell align="right">IVA</TableCell>
                          <TableCell align="right">Total</TableCell>
                          <TableCell align="center">Acciones</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginated.map((item, index) => {
                          const reciboData = getReciboData(item);
                          return (
                            <TableRow key={item.medidor || index}>
                              <TableCell>{item.numero}</TableCell>
                              <TableCell>{item.clienteIUSASOL}</TableCell>
                              <TableCell>{item.cliente}</TableCell>
                              <TableCell>{item.direccion}</TableCell>
                              <TableCell>{item.contratoSAP}</TableCell>
                              <TableCell>{item.medidor}</TableCell>
                              <TableCell>{item.nombreTarifa}</TableCell>
                              <TableCell align="right">{reciboData.descuento}</TableCell>
                              <TableCell align="right">${reciboData.tarifaCFE}</TableCell>
                              <TableCell align="right">${reciboData.tarifaIUSASOL}</TableCell>
                              <TableCell align="right">{reciboData.totalPeriodo}</TableCell>
                              <TableCell align="right">${reciboData.subtotal}</TableCell>
                              <TableCell align="right">${reciboData.iva}</TableCell>
                              <TableCell align="right">${reciboData.total}</TableCell>
                              <TableCell align="center">
                                <Stack direction="row" spacing={1} justifyContent="center">
                                  <Button 
                                    size="small" 
                                    variant="contained"
                                    onClick={() => setPreviewData(reciboData)}
                                  >
                                    Ver
                                  </Button>
                                  <PDFDownloadLink
                                    document={<ReciboPDF datos={reciboData} imagenes={{ logo: '/datosRecibo1.png', banner: '/datosRecibo2.png', qrSrc: '/datosRecibo3.png', footer: '/datosRecibo4.png' }} />}
                                    fileName={`recibo_${item.medidor}_${fechaInicio}_${fechaFin}.pdf`}
                                  >
                                    {({ loading }) => (
                                      <Button size="small" variant="outlined" disabled={loading}>
                                        {loading ? 'Generando...' : 'PDF'}
                                      </Button>
                                    )}
                                  </PDFDownloadLink>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box display="flex" justifyContent="center" p={2}>
                    <Pagination 
                      count={Math.ceil(data.length / pageSize)} 
                      page={page} 
                      onChange={(e, value) => setPage(value)}
                      color="primary"
                    />
                  </Box>
                </Card>

                <Card sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Totales
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">
                        Total Generación: {totales.genera.toLocaleString()} kWh
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">
                        Total Generación Neta: {totales.generacionNeta.toLocaleString()} kWh
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">
                        Total Monto: ${totales.monto.toLocaleString()}
                      </Typography>
                    </Grid>
                  </Grid>
                </Card>
              </>
            )}

            {previewData && (
              <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
                <Box sx={{ bgcolor: 'white', borderRadius: 2, p: 3, maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6">Vista Previa del Recibo</Typography>
                    <Button variant="outlined" color="error" onClick={() => setPreviewData(null)}>
                      Cerrar
                    </Button>
                  </Box>
                  <PDFViewer width="100%" height="500px" showToolbar>
                    <ReciboPDF datos={previewData} imagenes={{ logo: '/datosRecibo1.png', banner: '/datosRecibo2.png', qrSrc: '/datosRecibo3.png', footer: '/datosRecibo4.png' }} />
                  </PDFViewer>
                </Box>
              </Box>
            )}
          </Stack>
        </Container>
      </Box>
    </>
  );
}