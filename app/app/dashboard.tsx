import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert,
  Platform, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; 
import { supabase } from '../src/services/supabase';
import { WebView } from 'react-native-webview';

// --- HARDWARE SETTINGS ---
// Note: If you are using the wall plug, double check your IP in the hotspot settings!
const ESP32_IP = "10.129.42.120";

export default function Dashboard() {
  const router = useRouter();
  
  // State Management
  const [foodLevel, setFoodLevel] = useState(0);
  const [isSystemOnline, setSystemOnline] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  
  // Password Modal States
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Schedules (Full Original Details)
  const [schedules] = useState([
    { id: 1, time: '08:00', label: 'Breakfast', active: true },
    { id: 2, time: '08:30', label: 'Lunch', active: true },
    { id: 3, time: '09:30', label: 'Dinner', active: true },
  ]);

  useEffect(() => {
    fetchHistory();
    // HEARTBEAT: Start polling hardware for Food Level every 5 seconds
    const interval = setInterval(fetchLiveStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLiveStatus = async () => {
    try {
      const response = await fetch(`http://${ESP32_IP}/level`);
      const val = await response.text();
      const num = parseInt(val);
      setFoodLevel(isNaN(num) ? 0 : num);
      setSystemOnline(true);
    } catch (e) {
      setSystemOnline(false);
    }
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
      await supabase.from('feeding_history').insert([{ status: 'Manual Feed (App)' }]);
      Alert.alert("Success", "Feeding Started!");
      fetchHistory(); 
    } catch (error) {
      Alert.alert("Error", "ESP32 not reached.");
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert("Too Short", "Password must be at least 6 characters long.");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Admin password successfully updated!");
      setNewPassword('');
      setPasswordModalVisible(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "End session?", [
      { text: "Cancel" },
      { text: "Logout", onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/');
        } 
      }
    ]);
  };

  const cameraHTML = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body { margin: 0; padding: 0; background-color: black; display: flex; justify-content: center; align-items: center; height: 100vh; }
          img { width: 100%; height: auto; max-height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="http://${ESP32_IP}:81/stream?t=${Date.now()}" />
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.welcomeText}>Welcome, Admin</Text>
            <Text style={styles.headerTitle}>Overview</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity 
              style={[styles.iconBtn, showCamera && { backgroundColor: '#10B981' }]} 
              onPress={() => setShowCamera(!showCamera)}
            >
              <Ionicons name={showCamera ? "videocam" : "videocam-outline"} size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={fetchHistory}>
              <Ionicons name="refresh-outline" size={20} color="#A7F3D0" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#A7F3D0" />
            </TouchableOpacity>
          </View>
        </View>

        {showCamera && (
          <View style={styles.cameraContainer}>
            <WebView 
              key={showCamera ? "active" : "inactive"}
              originWhitelist={['*']}
              source={{ html: cameraHTML }} 
              style={styles.webViewStyle}
              scrollEnabled={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mixedContentMode="always"
            />
            <View style={styles.liveIndicator}>
              <View style={styles.redDot} />
              <Text style={styles.liveText}>LIVE MONITORING</Text>
            </View>
          </View>
        )}

        {!showCamera && (
          <View style={styles.bannerCard}>
            <Ionicons name="time-outline" size={20} color="#065F46" style={{marginRight: 12}} />
            <View>
              <Text style={styles.bannerLabel}>UPCOMING AUTO-FEED</Text>
              <Text style={styles.bannerValue}>08:00 AM - Breakfast</Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* --- STATUS CARDS --- */}
        <View style={styles.gridContainer}>
          <View style={styles.statusCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>Food Level</Text>
              <Ionicons name="nutrition-outline" size={18} color="#EF4444" />
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
            <Text style={styles.systemSubtext}>Hotspot Link</Text>
          </View>
        </View>

        {/* --- ADMIN CONTROLS --- */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Admin Controls</Text>
          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={() => Alert.alert("System", "Reboot command sent.")}>
              <View style={[styles.controlIconCircle, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="power" size={22} color="#EF4444" />
              </View>
              <Text style={styles.controlLabel}>Reboot</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn}>
              <View style={[styles.controlIconCircle, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="construct-outline" size={22} color="#6B7280" />
              </View>
              <Text style={styles.controlLabel}>Maint.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={() => router.push('/staff-management')}>
              <View style={[styles.controlIconCircle, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="people-outline" size={22} color="#3B82F6" />
              </View>
              <Text style={styles.controlLabel}>Staff</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={() => setPasswordModalVisible(true)}>
              <View style={[styles.controlIconCircle, { backgroundColor: '#F3E8FF' }]}>
                <Ionicons name="key-outline" size={22} color="#A855F7" />
              </View>
              <Text style={styles.controlLabel}>Password</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* --- AUTOMATION SCHEDULE --- */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Automation Schedule</Text>
          {schedules.map((item) => (
            <View key={item.id} style={styles.scheduleItem}>
              <View>
                <Text style={styles.scheduleTime}>{item.time}</Text>
                <Text style={styles.scheduleLabel}>{item.label}</Text>
              </View>
              <Switch value={item.active} trackColor={{ false: "#767577", true: "#047857" }} />
            </View>
          ))}
        </View>

        {/* --- FEEDING HISTORY --- */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Feeding History</Text>
          {history.length === 0 ? (
            <Text style={styles.systemSubtext}>No recent feedings.</Text>
          ) : (
            history.map((log) => (
              <View key={log.id} style={styles.historyItem}>
                <View style={styles.historyDot} />
                <View>
                  <Text style={styles.historyTime}>{log.time}</Text>
                  <Text style={styles.historyStatus}>{log.status}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#059669" style={{marginLeft: 'auto'}} />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* --- PASSWORD MODAL --- */}
      <Modal visible={passwordModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Admin Password</Text>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput 
                  style={styles.passwordInput} 
                  placeholder="At least 6 characters" 
                  secureTextEntry={!showPassword}
                  value={newPassword} 
                  onChangeText={setNewPassword} 
                  placeholderTextColor="#B0BEC5"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#90A4AE" />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={handleUpdatePassword} disabled={changingPassword}>
              {changingPassword ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Save Password</Text>}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#064E3B', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  welcomeText: { color: '#A7F3D0', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  headerIcons: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  cameraContainer: { height: 200, backgroundColor: 'black', borderRadius: 16, overflow: 'hidden', position: 'relative' },
  webViewStyle: { flex: 1, backgroundColor: 'black' },
  liveIndicator: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 6 },
  liveText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  bannerCard: { backgroundColor: '#D1FAE5', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  bannerLabel: { color: '#065F46', fontSize: 10, fontWeight: 'bold' },
  bannerValue: { color: '#064E3B', fontSize: 16, fontWeight: 'bold' },
  content: { padding: 20, paddingTop: 10 },
  gridContainer: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statusCard: { flex: 1, backgroundColor: 'white', borderRadius: 20, padding: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardLabel: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  foodPercent: { fontSize: 32, fontWeight: 'bold', color: '#EF4444', marginBottom: 8 },
  progressBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, marginTop: 10 },
  progressBarFill: { height: 6, backgroundColor: '#EF4444', borderRadius: 3 },
  systemStatusText: { fontSize: 24, fontWeight: 'bold', color: '#0F172A' },
  systemSubtext: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  sectionContainer: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155', marginBottom: 12 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'white', padding: 20, borderRadius: 20, elevation: 2 },
  controlBtn: { alignItems: 'center', gap: 8 },
  controlIconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  scheduleItem: { backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 10, elevation: 1 },
  scheduleTime: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  scheduleLabel: { fontSize: 12, color: '#94A3B8' },
  historyItem: { backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 8, elevation: 1 },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#059669', marginRight: 12 },
  historyTime: { fontSize: 14, fontWeight: 'bold', color: '#0F172A' },
  historyStatus: { fontSize: 12, color: '#64748B' },
  floatingContainer: { position: 'absolute', bottom: 30, alignSelf: 'center', width: '100%', alignItems: 'center' },
  feedNowBtn: { flexDirection: 'row', backgroundColor: '#064E3B', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30, alignItems: 'center', elevation: 8 },
  feedNowText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: '#E2E8F0' },
  passwordInput: { flex: 1, fontSize: 15, color: '#0F172A' },
  eyeBtn: { padding: 8, marginRight: -8 },
  submitBtn: { backgroundColor: '#3B82F6', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});