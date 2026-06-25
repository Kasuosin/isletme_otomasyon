import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';

export default function LoginScreen({ navigation }: any) {
  const [pin, setPin] = useState('');

  const handleLogin = () => {
    // Şimdilik PIN uzunluğu 4 ise giriş izni veriyoruz
    if (pin.length >= 4) {
      navigation.replace('RoleSelection');
    } else {
      alert('Lütfen 4 haneli giriş şifrenizi girin.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>KAFE PRO</Text>
          <Text style={styles.subtitle}>Personel İstasyonu</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Personel PIN Kodu</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="****"
            placeholderTextColor="#475569"
          />

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Sisteme Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 60 },
  title: { fontSize: 42, fontWeight: '900', color: '#ffffff', letterSpacing: 2 },
  subtitle: { fontSize: 18, color: '#94a3b8', marginTop: 8, fontWeight: '500' },
  form: { 
    backgroundColor: '#1e293b', 
    padding: 32, 
    borderRadius: 24, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 20, 
    elevation: 10 
  },
  label: { color: '#cbd5e1', fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  input: { 
    backgroundColor: '#0f172a', 
    color: '#fff', 
    fontSize: 36, 
    fontWeight: '700', 
    textAlign: 'center', 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 30, 
    borderWidth: 1, 
    borderColor: '#334155' 
  },
  button: { 
    backgroundColor: '#6366f1', 
    paddingVertical: 18, 
    borderRadius: 16, 
    alignItems: 'center' 
  },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' }
});
