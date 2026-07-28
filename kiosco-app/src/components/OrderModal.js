import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useBranding } from '../context/BrandingContext';

const METHODS = [
  { value: 'cash', label: 'Efectivo', icon: '💵' },
  { value: 'card', label: 'Tarjeta', icon: '💳' },
  { value: 'yape', label: 'Yape', icon: '💜' },
  { value: 'plin', label: 'Plin', icon: '💚' }
];

function safeHttpUrl(value) {
  const candidate = String(value || '').trim();
  return /^https?:\/\//i.test(candidate) ? candidate : '';
}

function methodDetails(config, method) {
  const nested = config?.[method] && typeof config[method] === 'object' ? config[method] : {};
  return {
    phone: nested.phone || config?.[`${method}Phone`] || '',
    qrUrl: safeHttpUrl(nested.qrUrl || nested.qr || config?.[`${method}QrUrl`] || '')
  };
}

export default function OrderModal({
  visible,
  initialCustomer,
  initialPhone,
  total,
  paymentsConfig,
  submitting,
  onClose,
  onSubmit
}) {
  const { width } = useWindowDimensions();
  const { theme } = useBranding();
  const styles = useMemo(() => createStyles(theme, width), [theme, width]);
  const [customer, setCustomer] = useState(initialCustomer || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentProof, setPaymentProof] = useState(null);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCustomer(initialCustomer || '');
    setPhone(initialPhone || '');
    setNotes('');
    setPaymentMethod('cash');
    setPaymentProof(null);
    setError('');
  }, [visible, initialCustomer, initialPhone]);

  const details = useMemo(
    () => methodDetails(paymentsConfig, paymentMethod),
    [paymentsConfig, paymentMethod]
  );

  async function pickPaymentProof() {
    setPicking(true);
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) throw new Error('No se pudo leer la imagen seleccionada.');
      const mimeType = asset.mimeType || 'image/jpeg';
      const imageData = `data:${mimeType};base64,${asset.base64}`;
      if (imageData.length > 420000) {
        throw new Error('La imagen es demasiado pesada. Recórtala o selecciona una más pequeña.');
      }
      setPaymentProof({
        imageData,
        fileName: asset.fileName || `comprobante-${Date.now()}.jpg`,
        contentType: mimeType,
        encodedLength: imageData.length,
        uri: asset.uri
      });
    } catch (pickerError) {
      setError(pickerError.message || 'No se pudo seleccionar la imagen.');
    } finally {
      setPicking(false);
    }
  }

  function submit() {
    const normalizedPhone = phone.replace(/\D/g, '').slice(0, 9);
    if (!customer.trim()) {
      setError('Ingresa el nombre del cliente.');
      return;
    }
    if (normalizedPhone && normalizedPhone.length !== 9) {
      setError('El teléfono debe tener 9 dígitos.');
      return;
    }
    if (paymentMethod !== 'cash' && !paymentProof) {
      setError('Adjunta la imagen del pago para Tarjeta, Yape o Plin.');
      return;
    }
    setError('');
    onSubmit({
      customer: customer.trim(),
      phone: normalizedPhone,
      notes: notes.slice(0, 300),
      paymentMethod,
      paymentProof
    });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Confirmar pedido</Text>
                <Text style={styles.subtitle}>Recojo en tienda · Total S/ {total.toFixed(2)}</Text>
              </View>
              <Pressable disabled={submitting} onPress={onClose} style={styles.close}><Text style={styles.closeText}>✕</Text></Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput value={customer} onChangeText={setCustomer} placeholder="Tu nombre" placeholderTextColor={theme.muted} style={styles.input} autoCapitalize="words" />

              <Text style={styles.label}>Teléfono</Text>
              <TextInput value={phone} onChangeText={value => setPhone(value.replace(/\D/g, '').slice(0, 9))} placeholder="9XX XXX XXX" placeholderTextColor={theme.muted} style={styles.input} keyboardType="phone-pad" maxLength={9} />

              <Text style={styles.label}>Método de pago</Text>
              <View style={styles.methods}>
                {METHODS.map(method => {
                  const selected = paymentMethod === method.value;
                  return (
                    <Pressable key={method.value} onPress={() => { setPaymentMethod(method.value); if (method.value === 'cash') setPaymentProof(null); }} style={[styles.method, selected && { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}>
                      <Text style={styles.methodIcon}>{method.icon}</Text>
                      <Text style={[styles.methodText, selected && styles.methodTextSelected]}>{method.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {['yape', 'plin'].includes(paymentMethod) ? (
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentTitle}>{paymentMethod === 'yape' ? '💜 Yape' : '💚 Plin'}</Text>
                  <Text style={styles.paymentText}>{details.phone ? `Número: ${details.phone}` : 'Número no configurado en Firestore.'}</Text>
                  {details.qrUrl ? <Image source={{ uri: details.qrUrl }} style={styles.qr} resizeMode="contain" /> : null}
                </View>
              ) : null}

              {paymentMethod !== 'cash' ? (
                <View>
                  <Text style={styles.label}>Imagen del pago *</Text>
                  <Pressable disabled={picking} onPress={pickPaymentProof} style={styles.proofButton}>
                    {picking ? <ActivityIndicator color={theme.primary} /> : <Text style={styles.proofButtonText}>{paymentProof ? 'Cambiar imagen' : 'Seleccionar imagen'}</Text>}
                  </Pressable>
                  {paymentProof?.uri ? <Image source={{ uri: paymentProof.uri }} style={styles.proofPreview} resizeMode="contain" /> : null}
                  {paymentProof ? <Pressable onPress={() => setPaymentProof(null)}><Text style={styles.removeProof}>Quitar imagen</Text></Pressable> : null}
                </View>
              ) : null}

              <View style={styles.notesHeader}><Text style={styles.label}>Notas</Text><Text style={styles.counter}>{notes.length}/300</Text></View>
              <TextInput value={notes} onChangeText={value => setNotes(value.slice(0, 300))} placeholder="Sin cebolla, extra salsa…" placeholderTextColor={theme.muted} style={[styles.input, styles.textarea]} multiline numberOfLines={3} maxLength={300} />

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable disabled={submitting} onPress={submit} style={[styles.submit, submitting && styles.disabled]}>
                {submitting ? <ActivityIndicator color={theme.white} /> : <Text style={styles.submitText}>Enviar pedido · S/ {total.toFixed(2)}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme, width) {
  const padding = width < 360 ? 14 : 20;
  return StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1, backgroundColor: theme.background },
    container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding, borderBottomWidth: 1, borderColor: theme.border, gap: 12 },
    headerText: { flex: 1, minWidth: 0 },
    title: { color: theme.text, fontSize: 22, fontWeight: '800' },
    subtitle: { color: theme.muted, marginTop: 4 },
    close: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    closeText: { color: theme.text, fontSize: 18 },
    content: { padding, paddingBottom: 30 },
    label: { color: theme.text, fontWeight: '700', marginBottom: 7, marginTop: 14 },
    input: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, color: theme.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
    textarea: { minHeight: 90, textAlignVertical: 'top' },
    methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    method: { width: width < 350 ? '100%' : '47%', minHeight: 52, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
    methodIcon: { fontSize: 19 },
    methodText: { color: theme.muted, fontWeight: '700' },
    methodTextSelected: { color: theme.text },
    paymentInfo: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
    paymentTitle: { color: theme.text, fontWeight: '800' },
    paymentText: { color: theme.muted, marginTop: 5 },
    qr: { width: Math.min(180, width - 70), height: Math.min(180, width - 70), alignSelf: 'center', marginTop: 12, backgroundColor: theme.white, borderRadius: 12 },
    proofButton: { borderWidth: 1, borderColor: theme.primary, borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySoft },
    proofButtonText: { color: theme.primary, fontWeight: '800' },
    proofPreview: { width: '100%', height: 220, marginTop: 12, backgroundColor: theme.white, borderRadius: 12 },
    removeProof: { color: theme.danger, textAlign: 'center', marginTop: 10, fontWeight: '700' },
    notesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    counter: { color: theme.muted, fontSize: 12, marginBottom: 7 },
    error: { color: theme.danger, marginTop: 14, fontWeight: '600' },
    footer: { padding, borderTopWidth: 1, borderColor: theme.border },
    submit: { backgroundColor: theme.primary, padding: 16, borderRadius: 14, alignItems: 'center' },
    submitText: { color: theme.white, fontWeight: '800', fontSize: 16 },
    disabled: { opacity: 0.55 }
  });
}
