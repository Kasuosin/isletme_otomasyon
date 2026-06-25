import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform, Modal, TextInput, Alert, ScrollView } from 'react-native';

export default function RoleSelectionScreen({ navigation }: any) {
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const handleAdminLogin = () => {
    if (passwordInput === '12345') {
      setIsPasswordModalVisible(false);
      setPasswordInput('');
      navigation.navigate('AdminPanel');
    } else {
      Alert.alert('Hata', 'Hatalı Şifre!');
      setPasswordInput('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hoş Geldiniz</Text>
        <Text style={styles.subtitle}>Lütfen çalışacağınız istasyonu seçin</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={[styles.card, styles.waiterCard]} onPress={() => navigation.navigate('WaiterPanel')}>
          <Text style={styles.emoji}>🤵</Text>
          <Text style={styles.cardTitle}>Garson Paneli</Text>
          <Text style={styles.cardDesc}>Masalar, Siparişler, Hesap ve Operasyon Yönetimi</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, styles.kitchenCard]} onPress={() => navigation.navigate('KitchenPanel')}>
          <Text style={styles.emoji}>👨‍🍳</Text>
          <Text style={styles.cardTitle}>Mutfak Paneli</Text>
          <Text style={styles.cardDesc}>Sipariş Hazırlama, Tamamlama ve Garson Bildirimleri</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, styles.adminCard]} onPress={() => setIsPasswordModalVisible(true)}>
          <Text style={styles.emoji}>💼</Text>
          <Text style={styles.cardTitle}>Patron Paneli</Text>
          <Text style={styles.cardDesc}>Canlı Ciro, Sipariş ve Finansal Takip Merkezi</Text>
        </TouchableOpacity>
      </ScrollView>
      
      <TouchableOpacity style={styles.logoutBtn} onPress={() => navigation.replace('Login')}>
         <Text style={styles.logoutText}>Oturumu Kapat</Text>
      </TouchableOpacity>

      <Modal visible={isPasswordModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Patron Girişi</Text>
            <Text style={styles.modalSubtitle}>Devam etmek için şifrenizi girin</Text>
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={passwordInput}
              onChangeText={setPasswordInput}
              keyboardType="number-pad"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => {setIsPasswordModalVisible(false); setPasswordInput('');}}>
                <Text style={styles.cancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn]} onPress={handleAdminLogin}>
                <Text style={styles.confirmBtnText}>Giriş</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 24, paddingTop: Platform.OS === 'android' ? 40 : 20 },
  header: { marginTop: 20, marginBottom: 40 },
  title: { fontSize: 36, fontWeight: '900', color: '#0f172a' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 8, fontWeight: '500' },
  grid: { paddingBottom: 20, gap: 24 },
  card: { 
    padding: 30, 
    borderRadius: 24, 
    alignItems: 'center', 
    backgroundColor: '#ffffff', 
    borderWidth: 2, 
    borderColor: '#e2e8f0',
    shadowColor: '#64748b', 
    shadowOffset: { width: 0, height: 8 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 16, 
    elevation: 4 
  },
  waiterCard: { borderColor: '#c7d2fe' },
  kitchenCard: { borderColor: '#fed7aa' },
  adminCard: { borderColor: '#cbd5e1' },
  emoji: { fontSize: 64, marginBottom: 20 },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#1e293b', marginBottom: 10 },
  cardDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  logoutBtn: { padding: 20, alignItems: 'center', marginBottom: 10 },
  logoutText: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#ffffff', width: '85%', borderRadius: 24, padding: 30, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10 },
  modalTitle: { fontSize: 24, fontWeight: '900', color: '#0f172a', marginBottom: 5 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  input: { width: '100%', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 15, fontSize: 18, textAlign: 'center', marginBottom: 20, color: '#0f172a', fontWeight: 'bold' },
  modalButtons: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  modalBtn: { flex: 1, paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5 },
  cancelBtn: { backgroundColor: '#f1f5f9' },
  confirmBtn: { backgroundColor: '#0f172a' },
  cancelBtnText: { color: '#64748b', fontWeight: 'bold', fontSize: 16 },
  confirmBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 }
});
