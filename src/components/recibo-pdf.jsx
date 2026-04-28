import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#222',
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  section: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  table: {
    marginTop: 12,
    border: '1px solid #ccc',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    fontWeight: 'bold',
  },
  tableCell: {
    flex: 1,
    padding: 4,
    borderRight: '1px solid #ccc',
    borderBottom: '1px solid #ccc',
  },
  tableCellLast: {
    flex: 1,
    padding: 4,
    borderBottom: '1px solid #ccc',
  },
  totalBox: {
    marginTop: 16,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  right: {
    textAlign: 'right',
  },
});

export function ReciboPDF({ datos }) {
  // datos: { cliente, direccion, medidor, periodo, totalPeriodo, tarifaCFE, descuento, tarifaIUSASOL, subtotal, iva, total, fechaLimite, tarifa, contratoSAP }
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>AVISO – RECIBO</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text>Industrias Unidas, S. A. de C. V.</Text>
            <Text>Total a Pagar: <Text style={{ fontWeight: 'bold' }}>${datos.total}</Text></Text>
          </View>
          <View style={styles.row}>
            <Text>RFC: UNU930517H19</Text>
            <Text>Número de Contrato SAP: {datos.contratoSAP || 'TDB'}</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={{ fontWeight: 'bold' }}>Datos del Usuario Final:</Text>
          <Text>{datos.cliente}</Text>
          <Text>{datos.direccion}</Text>
        </View>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text>Número de Medidor: {datos.medidor}</Text>
            <Text>Fecha límite de pago: {datos.fechaLimite}</Text>
          </View>
          <View style={styles.row}>
            <Text>Periodo facturado: {datos.periodo}</Text>
            <Text>Tarifa: {datos.tarifa}</Text>
          </View>
        </View>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableCell}>Concepto</Text>
            <Text style={styles.tableCell}>Total Periodo (kWh)</Text>
            <Text style={styles.tableCell}>Tarifa CFE (MN/kWh)</Text>
            <Text style={styles.tableCell}>Descuento (%)</Text>
            <Text style={styles.tableCellLast}>Tarifa IUSASOL (MN/kWh)</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.tableCell}>Energía Generada</Text>
            <Text style={styles.tableCell}>{datos.totalPeriodo}</Text>
            <Text style={styles.tableCell}>${datos.tarifaCFE}</Text>
            <Text style={styles.tableCell}>{datos.descuento}</Text>
            <Text style={styles.tableCellLast}>${datos.tarifaIUSASOL}</Text>
          </View>
        </View>
        <View style={styles.totalBox}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Desglose del Importe a Pagar</Text>
          <View style={styles.row}>
            <Text>Subtotal</Text>
            <Text style={styles.right}>${datos.subtotal}</Text>
          </View>
          <View style={styles.row}>
            <Text>IVA 16%</Text>
            <Text style={styles.right}>${datos.iva}</Text>
          </View>
          <View style={styles.row}>
            <Text style={{ fontWeight: 'bold' }}>Facturación del Periodo</Text>
            <Text style={{ fontWeight: 'bold' }}>${datos.total}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
