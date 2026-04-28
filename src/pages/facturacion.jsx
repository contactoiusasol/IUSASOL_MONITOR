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
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { leerExcel, obtenerDatosFacturacion, obtenerTodosMedidores, obtenerGeneracionPorPeriodo, calcularGeneracionTotal } from 'src/lib/facturacion';

// PDF Styles
const pdfStyles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  header: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  section: { marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontWeight: 'bold', width: 120 },
  value: { flex: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#000' },
  totalLabel: { fontWeight: 'bold', fontSize: 12 },
  totalValue: { fontWeight: 'bold', fontSize: 12 }
});

// PDF Document Component
const ReciboPDF = ({ data }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <Text style={pdfStyles.header}>RECIBO DE FACTURACIÓN - IUSASOL</Text>
      
      <View style={pdfStyles.section}>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Cliente:</Text>
          <Text style={pdfStyles.value}>{data.cliente}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Dirección:</Text>
          <Text style={pdfStyles.value}>{data.direccion}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Medidor:</Text>
          <Text style={pdfStyles.value}>{data.medidor}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Contrato SAP:</Text>
          <Text style={pdfStyles.value}>{data.contratoSAP}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Tarifa:</Text>
          <Text style={pdfStyles.value}>{data.tarifa}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Período:</Text>
          <Text style={pdfStyles.value}>{data.periodo}</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Generación (kWh):</Text>
          <Text style={pdfStyles.value}>{data.totalPeriodo}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Tarifa CFE:</Text>
          <Text style={pdfStyles.value}>${data.tarifaCFE}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Descuento:</Text>
          <Text style={pdfStyles.value}>{data.descuento}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Tarifa IUSASOL:</Text>
          <Text style={pdfStyles.value}>${data.tarifaIUSASOL}</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>Subtotal:</Text>
          <Text style={pdfStyles.value}>${data.subtotal}</Text>
        </View>
        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>IVA (16%):</Text>
          <Text style={pdfStyles.value}>${data.iva}</Text>
        </View>
        <View style={pdfStyles.totalRow}>
          <Text style={pdfStyles.totalLabel}>Total:</Text>
          <Text style={pdfStyles.totalValue}>${data.total}</Text>
        </View>
      </View>
    </Page>
  </Document>
);

export default function FacturacionPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

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
    
    // 4. Tarifa IUSASOL = Tarifa CFE - (Tarifa CFE * descuento) = Tarifa CFE * (1 - descuento)
    const tarifaIUSASOL = parseFloat((tarifaCFE * (1 - descuento)).toFixed(4));
    
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

    try {
      // Leer Excel
      const excelData = await leerExcel();
      if (!excelData || excelData.length === 0) {
        setError('No se encontraron datos en el archivo Excel');
        setLoading(false);
        return;
      }

      // Mostrar medidores repetidos
      const medidorCount = {};
      excelData.forEach(item => {
        if (!item.medidor) return;
        // Si tiene varios medidores separados por /
        const medidores = item.medidor.split('/').map(m => m.trim());
        medidores.forEach(med => {
          medidorCount[med] = (medidorCount[med] || 0) + 1;
        });
      });
      const repetidos = Object.entries(medidorCount).filter(([med, count]) => count > 1);
      if (repetidos.length > 0) {
        alert('Medidores repetidos en Excel:\n' + repetidos.map(([med, count]) => `${med}: ${count} veces`).join('\n'));
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

  const handleExportCsv = () => {
    if (data.length === 0) return;

    const headers = [
      'No', 'Cliente IUSASOL', 'Cliente', 'Dirección', 'Contrato SAP', 
      'Medidor', 'Nombre Tarifa', 'Descuento', 'Tarifa CFE', 'Tarifa IUSASOL',
      'Generación', 'Subtotal', 'IVA', 'Total'
    ];

    const rows = data.map(item => {
      const reciboData = getReciboData(item);
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
        item.tarifaIUSASOL,
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
                                    document={<ReciboPDF data={reciboData} />}
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
                    <ReciboPDF data={previewData} />
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