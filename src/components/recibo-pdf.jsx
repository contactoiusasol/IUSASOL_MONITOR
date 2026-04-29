import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#333',
    lineHeight: 1.4,
  },
  // Cabecera: Logo y Título
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  logo: {
    width: 200,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  // Imagen de los paneles solares
  banner: {
    width: '100%',
    height: 100,
    marginBottom: 15,
    objectFit: 'cover',
  },
  // Sección de datos en dos columnas
  twoColumnSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  column: {
    width: '48%',
  },
  label: {
    fontWeight: 'bold',
    fontSize: 11,
    marginBottom: 15,
  },
  dataBox: {
    marginBottom: 15,
  },
  // Cuadro destacado para el total
  highlightBox: {
    backgroundColor: '#f4f4f4',
    padding: 10,
    borderRadius: 2,
    borderLeft: '4pt solid #212121',
  },
  totalAmount: {
    borderTopColor: '#E67E22', // Naranja institucional
    backgroundColor: '#FDEBD0', // Fondo crema
    fontSize: 15,
    fontWeight: 'bold',
  },
  // Tabla de conceptos
  table: {
    marginTop: 20,
    width: '100%',
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#E67E22', // Naranja institucional
    borderBottomWidth: 2,
    borderBottomColor: '#E67E22',
    paddingVertical: 5,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#FDEBD0', // COLOR CLAVE: Naranja muy claro (Crema)
    borderBottomWidth: 1,
    borderBottomColor: '#E67E22', // Línea naranja delgada
    alignItems: 'center',
    minHeight: 25,
  },
  tableCellHeader: {
    flex: 1,
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#FFFFFF', // Texto blanco
    textAlign: 'center',
  },
  tableCell: {
    flex: 1,
    padding: 5,
    textAlign: 'center',
    fontSize: 9,
  },
  // QR y Desglose
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 20,
  },
  qrContainer: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  qrImage: {
    width: 70,
    height: 70,
    marginRight: 10,
  },
  qrTextContent: {
    flex: 1,
  },
  qrText: {
    fontSize: 9,
    textAlign: 'justify',
    lineHeight: 1.2,
  },
  qrSocialInvite: {
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 20,
  },
  // Desglose de importe
  breakdownContainer: {
    width: '40%',
    borderTopWidth: 1.5,
    borderTopColor: '#E67E22', // Naranja institucional
    paddingTop: 5,
  },
  breakdownHeader: {
    backgroundColor: '#E67E22', // Naranja fuerte institucional
    color: '#FFFFFF',
    padding: 4,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FDEBD0', // Fondo crema
    padding: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#FFFFFF', // Separador blanco sutil
  },
  // Pie de página
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
  },
  footerImage: {
    width: '100%',
    height: 175,
  }
});

export function ReciboPDF({ datos, imagenes }) {
  /**
   * imagenes debe contener:
   * logo: datosRecibo1.png
   * banner: datosRecibo2.jpg
   * qrSrc: datosRecibo3.png
   * footer: datosRecibo4.png
   */
  const { logo, banner, qrSrc, footer } = imagenes;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Cabecera */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>AVISO - RECIBO</Text>
          <Image src={logo} style={styles.logo} />
        </View>

        {/* Datos de Usuario y Pago */}
        <View style={styles.twoColumnSection}>
          <View style={styles.column}>
            <View style={styles.dataBox}>
              <Text style={styles.label}>Datos del Usuario Final:</Text>
              <Text style={{ fontWeight: 'bold', fontSize: 10 }}>{datos.cliente}</Text>
              <Text style={{ fontSize: 8 }}>{datos.direccion}</Text>
            </View>
            <View style={styles.dataBox}>
              <Text><Text style={styles.label}>Número de Medidor: </Text>{datos.medidor}</Text>
              <Text><Text style={styles.label}>Número de Contrato SAP: </Text>{datos.contratoSAP || 'TDB'}</Text>
              <Text><Text style={styles.label}>Tarifa: </Text>{datos.tarifa}</Text>
            </View>
          </View>

          <View style={styles.column}>
            <View style={styles.highlightBox}>
              <Text style={[styles.label, { marginBottom: 15 }]}>Total a Pagar:</Text>
              <Text style={styles.totalAmount}>${datos.total} M. N.</Text>
            </View>
            <View style={[styles.dataBox, { marginTop: 20 }]}>
              <Text><Text style={styles.label}>Período facturado: </Text>{datos.periodo}</Text>
              <Text><Text style={styles.label}>Fecha límite de pago: </Text>{datos.fechaLimite}</Text>
            </View>
          </View>
        </View>

        {/* Tabla */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCellHeader}>Concepto</Text>
            <Text style={styles.tableCellHeader}>Total Período (kWh)</Text>
            <Text style={styles.tableCellHeader}>Tarifa CFE (MN/kWh)</Text>
            <Text style={styles.tableCellHeader}>Descuento (%)</Text>
            <Text style={styles.tableCellHeader}>Tarifa IUSASOL (MN/kWh)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCell}>Energía Generada</Text>
            <Text style={styles.tableCell}>{datos.totalPeriodo}</Text>
            <Text style={styles.tableCell}>${datos.tarifaCFE}</Text>
            <Text style={styles.tableCell}>{datos.descuento}</Text>
            <Text style={styles.tableCell}>${datos.tarifaIUSASOL}</Text>
          </View>
        </View>

        {/* Banner principal */}
        <Image src={banner} style={styles.banner} />

        {/* Sección QR y Desglose corregida */}
        <View style={styles.summarySection}>
          <View style={styles.qrContainer}>
            <Image src={qrSrc} style={styles.qrImage} />
            <View style={styles.qrTextContent}>
              <Text style={styles.qrText}>
                En IUSASOL, hacemos de nuestros clientes y socios el centro de nuestra atención, buscando brindarles la mejor experiencia, con base a un excelente servicio, trato respetuoso, eficiente y que genere un ambiente de confianza.
              </Text>
              <Text style={styles.qrSocialInvite}>
                Te invitamos a visitar nuestras redes sociales:
              </Text>
            </View>
          </View>

          <View style={styles.breakdownContainer}>
            <Text style={styles.breakdownHeader}>Desglose del Importe a Pagar</Text>
            <View style={styles.breakdownRow}>
              <Text>Subtotal</Text>
              <Text>${datos.subtotal}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text>IVA 16%</Text>
              <Text>${datos.iva}</Text>
            </View>
            <View style={[styles.breakdownRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: '#FFFFFF' }]}>
              <Text style={{ fontWeight: 'bold', fontSize: 10 }}>Facturación del Período</Text>
              <Text style={{ fontWeight: 'bold', fontSize: 10 }}>${datos.total}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Image src={footer} style={styles.footerImage} />
        </View>

      </Page>
    </Document>
  );
}
