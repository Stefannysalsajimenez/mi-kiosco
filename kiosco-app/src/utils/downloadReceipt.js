import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { publicReceiptUrl } from '../services/receiptService';

function sanitizeFileName(value = 'recibo') {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'recibo';
}

function resolveReceiptUrl(order) {
  return (
    publicReceiptUrl(order) ||
    order?.receiptUrl ||
    order?.receipt?.publicUrl ||
    order?.receipt?.url ||
    order?.publicReceiptUrl ||
    order?.boletaUrl ||
    null
  );
}

function resolveReceiptNumber(order) {
  const series = order?.billing?.series;
  const number = order?.billing?.number;

  if (series && number) {
    return `${series}-${String(number).padStart(8, '0')}`;
  }

  return (
    order?.receiptNumber ||
    order?.receipt?.number ||
    order?.boletaNumber ||
    order?.id ||
    'recibo'
  );
}

export async function downloadReceipt(order) {
  const receiptUrl = resolveReceiptUrl(order);

  if (!receiptUrl) {
    Alert.alert(
      'Recibo no disponible',
      'El administrador todavía no ha emitido el recibo de este pedido.'
    );
    return;
  }

  if (Platform.OS === 'web') {
    window.open(receiptUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const isPdf =
    order?.receiptMimeType === 'application/pdf' ||
    /\.pdf(?:$|\?)/i.test(receiptUrl) ||
    /\/api\/boleta(?:$|\?)/i.test(receiptUrl);

  if (!isPdf) {
    await WebBrowser.openBrowserAsync(receiptUrl);
    return;
  }

  const fileName = `${sanitizeFileName(resolveReceiptNumber(order))}.pdf`;
  const localUri = `${FileSystem.cacheDirectory}${fileName}`;

  try {
    const result = await FileSystem.downloadAsync(receiptUrl, localUri);

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`La descarga respondió HTTP ${result.status}`);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Guardar, imprimir o compartir recibo'
      });
      return;
    }

    await WebBrowser.openBrowserAsync(receiptUrl);
  } catch (error) {
    console.warn('Descarga de recibo:', error);

    Alert.alert(
      'No se pudo descargar directamente',
      'El recibo se abrirá en el navegador.'
    );

    await WebBrowser.openBrowserAsync(receiptUrl);
  }
}
