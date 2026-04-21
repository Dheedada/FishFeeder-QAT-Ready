import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { WebView } from 'react-native-webview'; 
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; 
import { supabase } from './src/services/supabase'; 
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler'; 

// --- HARDWARE SETTINGS ---
const ESP32_IP = "10.51.140.120";

export default function StaffDashboard() {
  const router = useRouter();
  
  const [foodLevel, setFoodLevel] = useState(0);
  const [isSystemOnline, setSystemOnline] = useState(true);
  const [showCamera, setShowCamera] = useState(false); 
  const [history, setHistory] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchSchedules();
    const interval = setInterval(fetchLiveStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLiveStatus = async () => {
    try {
      const response = await fetch(`http://${ESP32_IP}/level`);
      const val = await response.text();
      setFoodLevel(parseInt(val) || 0);
      setSystemOnline(true);
    } catch (e) {
      setSystemOnline(false);
    }
  };

  const fetchSchedules = async () => {
    const { data } = await supabase.from('feeding_schedules').select('*');
    if (data) {
      setSchedules(data.map(s => ({
        time: s.time_of_day.substring(0, 5),
        active: s.is_active,
        label: s.label
      })));
    }
  };

  const getNextActiveSchedule = () => {
    const active = schedules.filter(s => s.active);
    if (active.length === 0) return "No active schedules";
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let next = active.find(s => s.time > currentTimeStr) || active[0];
    let [h, m] = next.time.split(':');
    let hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour.toString().padStart(2, '0')}:${m} ${ampm} - ${next.label}`;
  };

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('feeding_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (data) {
      setHistory(data.map((item: any) => ({
        id: item.id,
        time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: item.status
      })));
    }
  };

  const handleFeedNow = async () => {
    try {
      await fetch(`http://${ESP32_IP}/feed`);
      await supabase.from('feeding_history').insert([{ status: 'Manual Feed (Staff)' }]);
      Alert.alert("Success!", "Feeding Started!");
      fetchHistory(); 
    } catch (error) {
      Alert.alert("Error", "Feeder offline.");
    }
  };

  // --- FIXED: Refill is now strictly a database notification tool ---
  const handleRefill = async () => {
    Alert.alert(
      "Log Refill", 
      "Confirm that you have manually filled the 4-inch jar with food?", 
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: async () => {
           try {
             await supabase.from('feeding_history').insert([{ status: 'Food Hopper Refilled' }]);
             Alert.alert("Success", "Admin notified! The log has been updated.");
             fetchHistory();
           } catch (e) {
             Alert.alert("Error", "Could not connect to database.");
           }
        }}
      ]
    );
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (!error) {
      Alert.alert("Success", "Password updated!");
      setPasswordModalVisible(false);
      setNewPassword('');
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {/* --- HEADER --- */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.welcomeText}>Welcome, Staff</Text>
              <Text style={styles.headerTitle}>Overview</Text>
            </View>
            <View style={styles.headerIcons}>
              <TouchableOpacity 
                style={[styles.iconBtn, showCamera && {backgroundColor: '#10B981'}]} 
                onPress={() => setShowCamera(!showCamera)}
              >
                <Ionicons name="videocam-outline" size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={async () => { await supabase.auth.signOut(); router.replace('/'); }}>
                <Ionicons name="log-out-outline" size={20} color="#A7F3D0" />
              </TouchableOpacity>
            </View>
          </View>

          {showCamera ? (
            <View style={styles.cameraContainer}>
              <WebView source={{ html: `<html><body style="margin:0;background:black;"><img src="http://${ESP32_IP}:81/stream" style="width:100%;height:100%;object-fit:cover;"></body></html>` }} scrollEnabled={false} />
            </View>
          ) : (
            <View style={styles.bannerCard}>
              <Ionicons name="time-outline" size={20} color="#065F46" style={{marginRight: 12}} />
              <View>
                <Text style={styles.bannerLabel}>UPCOMING AUTO-FEED</Text>
                <Text style={styles.bannerValue}>{getNextActiveSchedule()}</Text>
              </View>
            </View>
          )}
        </View>

        <ScrollView style={styles.content}>
          {/* --- STATUS CARDS --- */}
          <View style={styles.gridContainer}>
            <View style={styles.statusCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>Food Stock</Text>
                <Ionicons name="nutrition" size={18} color="#EF4444" />
              </View>
              <Text style={styles.foodPercent}>{foodLevel}%</Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${foodLevel}%` }]} />
              </View>
            </View>

            <View style={styles.statusCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>System</Text>
                <Ionicons name="wifi" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.systemStatusText}>{isSystemOnline ? "Online" : "Offline"}</Text>
              <Text style={styles.systemSubtext}>Stable Connection</Text>
            </View>
          </View>

          {/* --- STAFF ACTIONS --- */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Staff Actions</Text>
            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.controlBtn} onPress={() => router.push('/ui/report')}>
                <View style={[styles.controlIconCircle, { backgroundColor: '#FEE2E2' }]}><Ionicons name="document-text-outline" size={22} color="#EF4444" /></View>
                <Text style={styles.controlLabel}>Report</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.controlBtn} onPress={handleRefill}>
                <View style={[styles.controlIconCircle, { backgroundColor: '#D1FAE5' }]}><Ionicons name="cube-outline" size={22} color="#059669" /></View>
                <Text style={styles.controlLabel}>Refill</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlBtn} onPress={() => setPasswordModalVisible(true)}>
                <View style={[styles.controlIconCircle, { backgroundColor: '#F3E8FF' }]}><Ionicons name="key-outline" size={22} color="#A855F7" /></View>
                <Text style={styles.controlLabel}>Password</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* --- FEEDING HISTORY --- */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Recent Feeding Logs</Text>
            {history.map((log) => (
              <Swipeable key={log.id} renderRightActions={() => (
                <TouchableOpacity style={styles.deleteAction} onPress={async () => { await supabase.from('feeding_history').delete().eq('id', log.id); fetchHistory(); }}>
                  <Ionicons name="trash" size={24} color="white" />
                </TouchableOpacity>
              )}>
                <View style={styles.historyItem}>
                  <View style={styles.historyDot} />
                  <View>
                    <Text style={styles.historyTime}>{log.time}</Text>
                    <Text style={styles.historyStatus}>{log.status}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#059669" style={{marginLeft: 'auto'}} />
                </View>
              </Swipeable>
            ))}
          </View>
        </ScrollView>

        {/* --- PASSWORD MODAL --- */}
        <Modal visible={passwordModalVisible} animationType="slide" transparent={true}>
          <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Change My Password</Text>
                <TouchableOpacity onPress={() => setPasswordModalVisible(false)}><Ionicons name="close" size={28} color="#64748B" /></TouchableOpacity>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Enter New Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput style={styles.passwordInput} placeholder="Min 6 characters" secureTextEntry={!showPassword} onChangeText={setNewPassword} placeholderTextColor="#B0BEC5" />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#90A4AE" />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={styles.submitBtn} onPress={handleUpdatePassword} disabled={changingPassword}>
                {changingPassword ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Update Password</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* --- FLOATING FEED BUTTON --- */}
        <View style={styles.floatingContainer}>
          <TouchableOpacity style={styles.feedNowBtn} onPress={handleFeedNow}>
            <Ionicons name="fish-outline" size={24} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.feedNowText}>Feed Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#064E3B', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  welcomeText: { color: '#A7F3D0', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  headerIcons: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  cameraContainer: { height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: 'black' },
  bannerCard: { backgroundColor: '#D1FAE5', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  bannerLabel: { color: '#065F46', fontSize: 10, fontWeight: 'bold' },
  bannerValue: { color: '#064E3B', fontSize: 16, fontWeight: 'bold' },
  content: { padding: 20 },
  gridContainer: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statusCard: { flex: 1, backgroundColor: 'white', borderRadius: 20, padding: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardLabel: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  foodPercent: { fontSize: 32, fontWeight: 'bold', color: '#EF4444' },
  progressBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, marginTop: 10 },
  progressBarFill: { height: 6, backgroundColor: '#EF4444', borderRadius: 3 },
  systemStatusText: { fontSize: 24, fontWeight: 'bold', color: '#0F172A' },
  systemSubtext: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  sectionContainer: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155', marginBottom: 12 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', backgroundColor: 'white', padding: 20, borderRadius: 20, elevation: 2 },
  controlBtn: { alignItems: 'center', gap: 8 },
  controlIconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  historyItem: { backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 8, elevation: 1 },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#059669', marginRight: 12 },
  historyTime: { fontSize: 14, fontWeight: 'bold', color: '#0F172A' },
  historyStatus: { fontSize: 12, color: '#64748B' },
  floatingContainer: { position: 'absolute', bottom: 30, alignSelf: 'center', width: '100%', alignItems: 'center' },
  feedNowBtn: { flexDirection: 'row', backgroundColor: '#064E3B', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30, alignItems: 'center', elevation: 8 },
  feedNowText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 80, height: '90%', borderTopRightRadius: 16, borderBottomRightRadius: 16, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: '#E2E8F0' },
  passwordInput: { flex: 1, fontSize: 15, color: '#0F172A' },
  eyeBtn: { padding: 8, marginRight: -8 },
  submitBtn: { backgroundColor: '#059669', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});