import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert,
  Platform, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; 
import { supabase } from './src/services/supabase';
import { WebView } from 'react-native-webview';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

// --- FIXED: Your Exact Hardware IP ---
const ESP32_IP = "172.31.9.120";

export default function Dashboard() {
  const router = useRouter();
  
  // State Management
  const [foodLevel, setFoodLevel] = useState(0);
  const [isSystemOnline, setSystemOnline] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  
  // Password Modal
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Schedule Modal
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [timeError, setTimeError] = useState('');
  const [schedules, setSchedules] = useState<any[]>([]);

  useEffect(() => {
    fetchHistory();
    fetchSchedules(); 
    const interval = setInterval(fetchLiveStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLiveStatus = async () => {
    try {
      // --- ADDED :88 PORT ---
      const response = await fetch(`http://${ESP32_IP}:88/status`);
      const data = await response.json(); 
      
      setFoodLevel(data.level);
      setIsMaintenanceMode(data.maint === 1); 
      
      setSystemOnline(true);
    } catch (e) {
      setSystemOnline(false);
    }
  };

  const syncSchedulesToHardware = async (currentSchedules: any[]) => {
    const activeSchedules = currentSchedules.filter(s => s.active);
    let query = '';
    
    if (activeSchedules.length > 0) {
      query += `s1=${activeSchedules[0].time}&a1=1`;
    } else {
      query += `s1=00:00&a1=0`; 
    }

    if (activeSchedules.length > 1) {
      query += `&s2=${activeSchedules[1].time}&a2=1`;
    } else {
      query += `&s2=00:00&a2=0`; 
    }

    try {
      // --- ADDED :88 PORT ---
      await fetch(`http://${ESP32_IP}:88/update_schedule?${query}`);
      console.log("Hardware Sync Success: " + query);
    } catch (e) {
      console.log("Hardware sync failed - check Wi-Fi");
    }
  };

  const fetchSchedules = async () => {
    const { data } = await supabase
      .from('feeding_schedules')
      .select('*')
      .order('time_of_day', { ascending: true });

    if (data) {
      const mappedData = data.map((item: any) => ({
        id: item.id,
        time: item.time_of_day.substring(0, 5), 
        label: item.label,
        active: item.is_active
      }));
      setSchedules(mappedData);
      syncSchedulesToHardware(mappedData);
    }
  };

  const fetchHistory = async () => {
    const { data } = await supabase.from('feeding_history').select('*').order('created_at', { ascending: false }).limit(5);
    if (data) {
      setHistory(data.map((item: any) => ({
        id: item.id,
        time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: item.status
      })));
    }
  };

  const getNextActiveSchedule = () => {
    const activeSchedules = schedules.filter(s => s.active);
    if (activeSchedules.length === 0) return "No active schedules";

    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let nextSched = activeSchedules.find(s => s.time > currentTimeStr);
    if (!nextSched) nextSched = activeSchedules[0]; 

    const [hourStr, minStr] = nextSched.time.split(':');
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour.toString().padStart(2, '0')}:${minStr} ${ampm} - ${nextSched.label}`;
  };

  const handleFeedNow = async () => {
    if (isMaintenanceMode) {
       Alert.alert("Safety Lock Active", "The system is in Maintenance Mode.");
       return;
    }
    try {
      // --- ADDED :88 PORT ---
      await fetch(`http://${ESP32_IP}:88/feed`); 
      await supabase.from('feeding_history').insert([{ status: 'Manual Feed (App)' }]);
      Alert.alert("Success", "Feeding Started!");
      fetchHistory(); 
    } catch (error) {
      Alert.alert("Error", "Feeder not reached.");
    }
  };

  const handleReboot = () => {
    Alert.alert("Reboot System", "Restart ESP32 hardware?", [
      { text: "Cancel", style: "cancel" },
      { text: "Reboot", style: "destructive", onPress: async () => {
          try {
            // --- ADDED :88 PORT ---
            await fetch(`http://${ESP32_IP}:88/reboot`); 
            Alert.alert("Rebooting", "Hardware is restarting.");
            setSystemOnline(false); 
          } catch (e) {}
        }
      }
    ]);
  };

  const handleMaintenance = async () => {
    if (isMaintenanceMode) {
       try {
         // --- ADDED :88 PORT ---
         await fetch(`http://${ESP32_IP}:88/maintenance?state=0`);
         setIsMaintenanceMode(false);
         Alert.alert("Maintenance Mode OFF", "System is back to normal operation.");
       } catch (error) {
         Alert.alert("Error", "Could not reach hardware to unlock.");
       }
    } else {
       Alert.alert("Enable Maintenance Mode?", "Safety lock activated. Feeding is disabled.", [
           { text: "Cancel", style: "cancel" },
           { text: "Enable", onPress: async () => {
               try {
                 // --- ADDED :88 PORT ---
                 await fetch(`http://${ESP32_IP}:88/maintenance?state=1`);
                 setIsMaintenanceMode(true);
               } catch (error) {
                 Alert.alert("Error", "Could not reach hardware to lock.");
               }
           }}
         ]);
    }
  };

  const toggleSchedule = async (id: number, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const updatedSchedules = schedules.map(s => s.id === id ? { ...s, active: newStatus } : s);
    setSchedules(updatedSchedules);
    syncSchedulesToHardware(updatedSchedules); 

    const { error } = await supabase.from('feeding_schedules').update({ is_active: newStatus }).eq('id', id);
    if (error) fetchSchedules(); 
  };

  const handleDeleteSchedule = async (id: number) => {
    Alert.alert("Delete Schedule", "Are you sure you want to remove this time?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          const updatedSchedules = schedules.filter(item => item.id !== id);
          setSchedules(updatedSchedules);
          syncSchedulesToHardware(updatedSchedules);
          await supabase.from('feeding_schedules').delete().eq('id', id);
        }
      }
    ]);
  };

  const handleDeleteHistory = async (id: number) => {
    await supabase.from('feeding_history').delete().eq('id', id);
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleTimeChange = (text: string) => {
    setTimeError(''); 
    let cleaned = text.replace(/[^0-9:]/g, '');
    if (cleaned.length > 5) return;
    if (cleaned.length === 2 && newTime.length === 1 && !cleaned.includes(':')) cleaned = cleaned + ':';
    if (cleaned.length === 2 && newTime.length === 3 && cleaned.includes(':')) cleaned = cleaned.slice(0, 1);
    setNewTime(cleaned);
  };

  const handleAddSchedule = async () => {
    if (!newTime || !newLabel) return setTimeError('Both fields required.');
    const parts = newTime.split(':');
    if (parts.length !== 2 || newTime.length !== 5) return setTimeError('Use HH:MM format');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || hours < 0 || hours > 23) return setTimeError('Hours 00-23');
    if (isNaN(minutes) || minutes < 0 || minutes > 59) return setTimeError('Minutes 00-59');

    const formattedTime = `${newTime}:00`; 
    const { error } = await supabase.from('feeding_schedules').insert([{ time_of_day: formattedTime, label: newLabel, is_active: true }]);
    
    if (!error) {
      setScheduleModalVisible(false);
      setNewTime(''); setNewLabel(''); setTimeError(''); 
      fetchSchedules(); 
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) return Alert.alert("Error", "Password must be 6 characters.");
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (!error) { Alert.alert("Success", "Password updated!"); setPasswordModalVisible(false); }
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "End session?", [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: async () => { await supabase.auth.signOut(); router.replace('/'); } }
    ]);
  };

  const renderScheduleRightActions = (id: number) => (
    <TouchableOpacity style={styles.scheduleDeleteAction} onPress={() => handleDeleteSchedule(id)}>
      <Ionicons name="trash" size={24} color="white" />
    </TouchableOpacity>
  );

  const renderHistoryRightActions = (id: number) => (
    <TouchableOpacity style={styles.deleteAction} onPress={() => handleDeleteHistory(id)}>
      <Ionicons name="trash" size={24} color="white" />
    </TouchableOpacity>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View><Text style={styles.welcomeText}>Welcome, Admin</Text><Text style={styles.headerTitle}>Overview</Text></View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={[styles.iconBtn, showCamera && { backgroundColor: '#10B981' }]} onPress={() => setShowCamera(!showCamera)}><Ionicons name="videocam-outline" size={20} color="white" /></TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => { fetchHistory(); fetchSchedules(); }}><Ionicons name="refresh-outline" size={20} color="#A7F3D0" /></TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}><Ionicons name="log-out-outline" size={20} color="#A7F3D0" /></TouchableOpacity>
          </View>
        </View>
        {showCamera ? (
          <View style={styles.cameraContainer}><WebView source={{ html: `<html><body style="margin:0;background:black;"><img src="http://${ESP32_IP}:81/stream" style="width:100%;height:100%;object-fit:cover;"></body></html>` }} scrollEnabled={false} /></View>
        ) : (
          <View style={styles.bannerCard}><Ionicons name="time-outline" size={20} color="#065F46" style={{marginRight: 12}} /><View><Text style={styles.bannerLabel}>UPCOMING AUTO-FEED</Text><Text style={styles.bannerValue}>{getNextActiveSchedule()}</Text></View></View>
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.gridContainer}>
          <View style={styles.statusCard}><View style={styles.cardHeader}><Text style={styles.cardLabel}>Food Level</Text><Ionicons name="nutrition-outline" size={18} color="#EF4444" /></View><Text style={styles.foodPercent}>{foodLevel}%</Text><View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${foodLevel}%` }]} /></View></View>
          <View style={styles.statusCard}><View style={styles.cardHeader}><Text style={styles.cardLabel}>System</Text><Ionicons name="wifi" size={18} color="#3B82F6" /></View><Text style={styles.systemStatusText}>{isSystemOnline ? "Online" : "Offline"}</Text></View>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Admin Controls</Text>
          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={() => router.push('/ui/report')}><View style={[styles.controlIconCircle, { backgroundColor: '#FEE2E2' }]}><Ionicons name="document-text-outline" size={22} color="#EF4444" /></View><Text style={styles.controlLabel}>Report</Text></TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={handleReboot}><View style={[styles.controlIconCircle, { backgroundColor: '#FEE2E2' }]}><Ionicons name="power" size={22} color="#EF4444" /></View><Text style={styles.controlLabel}>Reboot</Text></TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={handleMaintenance}><View style={[styles.controlIconCircle, isMaintenanceMode ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#F3F4F6' }]}><Ionicons name="construct-outline" size={22} color={isMaintenanceMode ? "#D97706" : "#6B7280"} /></View><Text style={[styles.controlLabel, isMaintenanceMode && { color: '#D97706' }]}>Maint.</Text></TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={() => router.push('/staff-management')}><View style={[styles.controlIconCircle, { backgroundColor: '#DBEAFE' }]}><Ionicons name="people-outline" size={22} color="#3B82F6" /></View><Text style={styles.controlLabel}>Staff</Text></TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={() => setPasswordModalVisible(true)}><View style={[styles.controlIconCircle, { backgroundColor: '#F3E8FF' }]}><Ionicons name="key-outline" size={22} color="#A855F7" /></View><Text style={styles.controlLabel}>Password</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Automation Schedule</Text>
            <TouchableOpacity onPress={() => setScheduleModalVisible(true)}><Ionicons name="add-circle" size={28} color="#064E3B" /></TouchableOpacity>
          </View>
          {schedules.map((item) => (
            <Swipeable key={item.id} renderRightActions={() => renderScheduleRightActions(item.id)}>
              <View style={styles.scheduleItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scheduleTime}>{item.time}</Text>
                  <Text style={styles.scheduleLabel}>{item.label}</Text>
                </View>
                <Switch 
                  value={item.active} 
                  onValueChange={() => toggleSchedule(item.id, item.active)} 
                  trackColor={{ false: "#E2E8F0", true: "#A7F3D0" }} 
                  thumbColor={item.active ? "#059669" : "#94A3B8"} 
                  ios_backgroundColor="#E2E8F0" 
                />
              </View>
            </Swipeable>
          ))}
          {schedules.length === 0 && <Text style={[styles.systemSubtext, {textAlign: 'center', marginTop: 10}]}>No schedules set yet.</Text>}
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Feeding History</Text>
          {history.map((log) => (
            <Swipeable key={log.id} renderRightActions={() => renderHistoryRightActions(log.id)}>
              <View style={styles.historyItem}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTime}>{log.time}</Text>
                  <Text style={styles.historyStatus}>{log.status}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#059669" style={{ marginRight: 12 }} />
              </View>
            </Swipeable>
          ))}
        </View>
      </ScrollView>

      {/* Modal section remains unchanged */}
      <Modal visible={scheduleModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Add Schedule</Text><TouchableOpacity onPress={() => { setScheduleModalVisible(false); setTimeError(''); setNewTime(''); setNewLabel(''); }}><Ionicons name="close" size={28} color="#64748B" /></TouchableOpacity></View>
            <View style={styles.inputGroup}><Text style={styles.label}>Time (HH:MM - 24hr)</Text><View style={[styles.textInputContainer, timeError ? { borderColor: '#EF4444', borderWidth: 1.5 } : null]}><TextInput style={styles.textInputBase} placeholder="e.g., 08:00" value={newTime} onChangeText={handleTimeChange} keyboardType="number-pad" maxLength={5} /></View>{timeError ? <Text style={styles.errorText}>{timeError}</Text> : null}</View>
            <View style={styles.inputGroup}><Text style={styles.label}>Label</Text><View style={styles.textInputContainer}><TextInput style={styles.textInputBase} placeholder="e.g., Snack" value={newLabel} onChangeText={setNewLabel} /></View></View>
            <TouchableOpacity style={styles.submitBtn} onPress={handleAddSchedule}><Text style={styles.submitBtnText}>Save Schedule</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={passwordModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Change My Password</Text><TouchableOpacity onPress={() => setPasswordModalVisible(false)}><Ionicons name="close" size={28} color="#64748B" /></TouchableOpacity></View>
            <View style={styles.inputGroup}><Text style={styles.label}>New Password</Text><View style={styles.passwordContainer}><TextInput style={styles.passwordInput} placeholder="Min 6 characters" secureTextEntry={!showPassword} value={newPassword} onChangeText={setNewPassword} /><TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}><Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#90A4AE" /></TouchableOpacity></View></View>
            <TouchableOpacity style={styles.submitBtn} onPress={handleUpdatePassword} disabled={changingPassword}>{changingPassword ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Update Password</Text>}</TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.floatingContainer}><TouchableOpacity style={[styles.feedNowBtn, isMaintenanceMode && { backgroundColor: '#94A3B8' }]} onPress={handleFeedNow}><Ionicons name={isMaintenanceMode ? "lock-closed" : "fish-outline"} size={24} color="white" style={{ marginRight: 8 }} /><Text style={styles.feedNowText}>{isMaintenanceMode ? "Locked" : "Feed Now"}</Text></TouchableOpacity></View>
    </GestureHandlerRootView>
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
  cameraContainer: { height: 200, backgroundColor: 'black', borderRadius: 16, overflow: 'hidden' },
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
  submitBtn: { backgroundColor: '#4CA771', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  deleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 80, height: '90%', borderTopRightRadius: 16, borderBottomRightRadius: 16, marginBottom: 8 },
  scheduleDeleteAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 80, height: '90%', borderTopRightRadius: 16, borderBottomRightRadius: 16, marginBottom: 10 },
  textInputContainer: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center' },
  textInputBase: { fontSize: 15, color: '#0F172A' },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 4, marginLeft: 4, fontWeight: '600' }
});