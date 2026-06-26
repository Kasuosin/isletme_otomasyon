import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export default function BusinessLoginScreen({ navigation }: any) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const storedId = await AsyncStorage.getItem('restaurant_id');
      if (storedId) {
        navigation.replace('Login');
      } else {
        setIsCheckingSession(false);
      }
    } catch (error) {
      console.error('AsyncStorage error:', error);
      setIsCheckingSession(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.trim().length === 0) {
      Alert.alert('Uyarı', 'Lütfen restoran kodunu girin.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name')
        .eq('restaurant_code', code.trim().toUpperCase())
        .single();

      if (error || !data) {
        Alert.alert('Hata', 'Geçersiz restoran kodu. Lütfen tekrar deneyin.');
        setIsLoading(false);
        return;
      }

      await AsyncStorage.setItem('restaurant_id', data.id);
      await AsyncStorage.setItem('restaurant_name', data.name);
      
      Alert.alert('Başarılı', `Hoş geldiniz, ${data.name}!`, [
        { text: 'Devam Et', onPress: () => navigation.replace('Login') }
      ]);

    } catch (error) {
      console.error(error);
      Alert.alert('Hata', 'Bağlantı sırasında bir sorun oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>KAFE PRO SaaS</Text>
          <Text style={styles.subtitle}>İşletme Doğrulama</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Restoran Kodu</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="Örn: MERKEZ01"
            placeholderTextColor="#475569"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.button} onPress={handleVerifyCode} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Kurumu Doğrula</Text>
            )}
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
  title: { fontSize: 32, fontWeight: '900', color: '#ffffff', letterSpacing: 2 },
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
    fontSize: 24, 
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
    alignItems: 'center',
    height: 60,
    justifyContent: 'center'
  },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' }
});
