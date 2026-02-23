import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Swipeable } from 'react-native-gesture-handler';

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [foodLevel, setFoodLevel] = useState<number | null>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // --- MODAL & SETTINGS STATE ---
  const [modalVisible, setModalVisible] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (data?.role === 'admin') setIsAdmin(true);
    }
  };

  const fetchSensorData = async () => {
    try {
      const { data, error } = await supabase.from('sensor_logs').select('food_level').order('created_at', { ascending: false }).limit(1).single();
      if (!error && data) {
        setFoodLevel(data.food_level);
        if (data.food_level < 20) await Notifications.scheduleNotificationAsync({ content: { title: "⚠️ Low Food", body: `Level critical: ${data.food_level}%.` }, trigger: null });
      }
    } catch (error) { console.log(error); }
  };

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase.from('feeding_schedules').select('*').order('time_of_day', { ascending: true });
      if (!error) setSchedules(data || []);
    } catch (error) { console.log(error); }
  };

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase.from('command_queue').select('*').order('created_at', { ascending: false }).limit(6);
      if (!error && data) setHistory(data);
    } catch (error) { console.log(error); }
  };

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([fetchSensorData(), fetchSchedules(), fetchHistory(), checkUserRole()]);
    setLoading(false);
  };

  // --- HELPER FUNCTION: CALCULATE NEXT FEEDING TIME ---
  const getNextFeedTime = () => {
    if (!schedules || schedules.length === 0) return "No schedules set";
    
    const activeSchedules = schedules.filter(s => s.is_active);
    if (activeSchedules.length === 0) return "Schedules paused";

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Find the first schedule that happens AFTER the current time today
    let next = activeSchedules.find(s => {
      const [h, m] = s.time_of_day.split(':').map(Number);
      return (h * 60 + m) > currentMinutes;
    });

    // If no more feeds today, the next one is the first schedule tomorrow
    if (!next) next = activeSchedules[0];

    // Format the output nicely (e.g. "08:30 AM")
    const [h, m] = next.time_of_day.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 || 12; // Convert 24h to 12h
    return `${formattedHour}:${m} ${ampm} - ${next.label}`;
  };

  // --- ACTIONS ---
  const handleFeed = async () => {
    try {
      await supabase.from('command_queue').insert([{ command: 'DISPENSE', status: 'PENDING' }]);
      Alert.alert("Command Sent", "Feeding initiated.");
      fetchHistory();
    } catch (error) { Alert.alert("Error", "Failed to send command."); }
  };

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/');
        }
      }
    ]);
  };

  const handleReboot = () => {
    Alert.alert("Remote Reboot", "Are you sure you want to restart the hardware system?", [
      { text: "Cancel", style: "cancel" },
      { text: "Reboot", style: "destructive", onPress: async () => {
          await supabase.from('command_queue').insert([{ command: 'REBOOT', status: 'PENDING' }]);
          fetchHistory();
          Alert.alert("System Override", "Reboot command sent to hardware.");
        }
      }
    ]);
  };

  const handleManageStaff = () => {
    Alert.alert("Staff Management", "This module allows you to invite new staff, reset passwords, or revoke access. (Prototype Feature)");
  };

  const handleReportIssue = () => {
    Alert.alert(
      "Report Issue", 
      "Has the food hopper jammed or is the hardware unresponsive?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send Alert to Admin", style: "destructive", onPress: () => {
            Alert.alert("Report Sent", "The Admin has been notified of the hardware issue.");
          }
        }
      ]
    );
  };

  const handleAddNewSchedule = async () => {
    if (!newTime || !newLabel) return Alert.alert("Missing Info", "Please fill in both fields.");
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newTime)) return Alert.alert("Invalid Time", "Use HH:MM format.");
    setSaving(true);
    const { error } = await supabase.from('feeding_schedules').insert([{ time_of_day: newTime, label: newLabel, is_active: true }]);
    setSaving(false);
    if (error) Alert.alert("Error", error.message);
    else { setModalVisible(false); setNewTime(''); setNewLabel(''); fetchSchedules(); }
  };

  const handleDeleteSchedule = (id: number) => {
    Alert.alert("Delete Schedule", "Are you sure you want to remove this feeding time?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          const { error } = await supabase.from('feeding_schedules').delete().eq('id', id);
          if (error) Alert.alert("Error", error.message);
          else fetchSchedules();
        }
      }
    ]);
  };

  const renderRightActions = (id: number) => {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={() => handleDeleteSchedule(id)}>
        <Ionicons name="trash-outline" size={24} color="white" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  useEffect(() => {
    async function requestPermissions() {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') await Notifications.requestPermissionsAsync();
    }
    requestPermissions();
    loadAllData();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greetingText}>Welcome, {isAdmin ? "Admin" : "Staff"}</Text>
            <Text style={styles.headerTitle}>Overview</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={() => Alert.alert("Live Camera", "Connecting to ESP32-CAM stream...")} style={styles.iconBtn}>
              <Ionicons name="videocam-outline" size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={loadAllData} style={styles.iconBtn}>
              <Ionicons name="refresh-outline" size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}>
              <Ionicons name="log-out-outline" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 120}}>
        
        {/* --- NEXT SCHEDULED FEED HIGHLIGHT (COMPACT VERSION) --- */}
        <View style={styles.nextFeedCard}>
          <View style={styles.nextFeedIconWrap}>
            <Ionicons name="time-outline" size={20} color="#004D40" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextFeedLabel}>Upcoming Auto-Feed</Text>
            <Text style={styles.nextFeedTime}>{getNextFeedTime()}</Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <View style={styles.statusCard}>
            <View style={styles.cardHeaderRow}>
               <Text style={styles.cardTitle}>Food Level</Text>
               <Ionicons name="nutrition-outline" size={20} color={(foodLevel !== null && foodLevel < 20) ? "#D32F2F" : "#004D40"} />
            </View>
            <Text style={[styles.cardValue, (foodLevel !== null && foodLevel < 20) ? {color: "#D32F2F"} : {}]}>
              {foodLevel !== null ? `${foodLevel}%` : "--"}
            </Text>
            <View style={styles.progressBarBg}>
               <View style={[styles.progressBarFill, {width: `${foodLevel || 0}%`, backgroundColor: (foodLevel !== null && foodLevel < 20) ? "#D32F2F" : "#004D40"}]} />
            </View>
          </View>
          <View style={styles.statusCard}>
            <View style={styles.cardHeaderRow}>
               <Text style={styles.cardTitle}>System</Text>
               <Ionicons name="wifi-outline" size={20} color={maintenanceMode ? "#F57C00" : "#0277BD"} />
            </View>
            <Text style={styles.cardValue}>{maintenanceMode ? "Paused" : "Online"}</Text>
            <Text style={styles.cardSub}>{maintenanceMode ? "Maintenance Mode" : "Stable Connection"}</Text>
          </View>
        </View>

        {/* ADMIN CONTROLS */}
        {isAdmin && (
          <View style={styles.adminPanel}>
            <Text style={styles.sectionTitle}>Admin Controls</Text>
            <View style={styles.adminButtonsRow}>
              <TouchableOpacity style={styles.adminBtn} onPress={handleReboot}>
                <View style={[styles.adminIconWrap, { backgroundColor: '#FFEBEE' }]}>
                  <Ionicons name="power-outline" size={20} color="#D32F2F" />
                </View>
                <Text style={styles.adminBtnText}>Reboot</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.adminBtn} onPress={() => setMaintenanceMode(!maintenanceMode)}>
                <View style={[styles.adminIconWrap, { backgroundColor: maintenanceMode ? '#FFF3E0' : '#ECEFF1' }]}>
                  <Ionicons name="build-outline" size={20} color={maintenanceMode ? "#F57C00" : "#546E7A"} />
                </View>
                <Text style={styles.adminBtnText}>Maint.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.adminBtn} onPress={handleManageStaff}>
                <View style={[styles.adminIconWrap, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="people-outline" size={20} color="#1565C0" />
                </View>
                <Text style={styles.adminBtnText}>Staff</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STAFF TOOLS */}
        {!isAdmin && (
          <View style={styles.staffPanel}>
            <TouchableOpacity style={styles.reportBtn} onPress={handleReportIssue}>
              <Ionicons name="warning-outline" size={20} color="#D32F2F" />
              <Text style={styles.reportBtnText}>Report Hardware Issue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Schedules */}
        <View style={styles.sectionHeader}>
           <Text style={styles.sectionTitle}>Automation Schedule</Text>
           {isAdmin && (
             <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtnSm}>
               <Text style={styles.addText}>+ Add</Text>
             </TouchableOpacity>
           )}
        </View>
        
        <View style={styles.listBox}>
          {schedules.length === 0 ? (
            <Text style={styles.emptyText}>No schedules configured.</Text>
          ) : (
            schedules.map((item, index) => {
              const RowContent = (
                <View style={[styles.listItem, index === schedules.length - 1 && {borderBottomWidth: 0}]}>
                  <View>
                    <Text style={styles.itemTitle}>{item.time_of_day.substring(0, 5)}</Text>
                    <Text style={styles.itemSub}>{item.label}</Text>
                  </View>
                  <Ionicons name={item.is_active ? "toggle" : "toggle-outline"} size={28} color={item.is_active ? "#004D40" : "#CFD8DC"} />
                </View>
              );

              return isAdmin ? (
                <Swipeable key={item.id} renderRightActions={() => renderRightActions(item.id)} containerStyle={{backgroundColor: '#D32F2F'}}>
                  {RowContent}
                </Swipeable>
              ) : (
                <View key={item.id}>{RowContent}</View>
              );
            })
          )}
        </View>

        {/* History / Audit Logs */}
        <View style={styles.sectionHeader}>
           <Text style={styles.sectionTitle}>{isAdmin ? "System Audit Logs" : "Recent Feeding History"}</Text>
        </View>
        <View style={styles.listBox}>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No recent activity.</Text>
          ) : (
            history.map((item, index) => (
              <View key={item.id} style={[styles.listItem, index === history.length - 1 && {borderBottomWidth: 0}]}>
                <View style={[styles.historyIconWrap, { backgroundColor: item.command === 'REBOOT' ? '#FFEBEE' : '#F5F7FA'}]}>
                   <Ionicons 
                    name={item.command === 'DISPENSE' ? "restaurant-outline" : item.command === 'REBOOT' ? "power-outline" : "cog-outline"} 
                    size={18} 
                    color={item.command === 'REBOOT' ? "#D32F2F" : "#455A64"} 
                   />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.itemTitleAlt}>
                    {item.command === 'DISPENSE' ? "Manual Override Feed" : item.command === 'REBOOT' ? "Hardware Reboot" : item.command}
                  </Text>
                  <Text style={styles.itemSub}>
                    {isAdmin && item.command !== 'AUTO' ? "User Initiated • " : ""}
                    {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  </Text>
                </View>
                <View style={[styles.badge, {backgroundColor: item.status === 'PROCESSED' ? '#E8F5E9' : '#FFF3E0'}]}>
                  <Text style={[styles.badgeText, {color: item.status === 'PROCESSED' ? '#2E7D32' : '#EF6C00'}]}>{item.status}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB - Hidden if in Maintenance Mode */}
      {!maintenanceMode && (
        <TouchableOpacity style={styles.fab} onPress={handleFeed} activeOpacity={0.9}>
          <Ionicons name="fish" size={24} color="white" />
          <Text style={styles.fabText}>Feed Now</Text>
        </TouchableOpacity>
      )}

      {/* Modal */}
      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeader}>New Schedule</Text>
            <Text style={styles.modalLabel}>Time (HH:MM)</Text>
            <TextInput style={styles.modalInput} placeholder="08:00" value={newTime} onChangeText={setNewTime} keyboardType="numbers-and-punctuation" maxLength={5} />
            <Text style={styles.modalLabel}>Label</Text>
            <TextInput style={styles.modalInput} placeholder="Breakfast" value={newLabel} onChangeText={setNewLabel} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={handleAddNewSchedule} disabled={saving}>
                <Text style={styles.modalBtnTextSave}>{saving ? "Saving..." : "Save Schedule"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  headerBlock: { backgroundColor: '#004D40', paddingVertical: 60, paddingHorizontal: 24, borderBottomRightRadius: 32 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetingText: { color: '#B2DFDB', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: 'white', fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  headerButtons: { flexDirection: 'row', gap: 6 },
  iconBtn: { backgroundColor: 'rgba(255,255,255,0.15)', width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  contentContainer: { padding: 24, marginTop: -40 },
  
  // UPDATED: Compact Next Feed Card Styles
  nextFeedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0F2F1', borderRadius: 16, padding: 14, marginBottom: 16, shadowColor: "#000", shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  nextFeedIconWrap: { width: 36, height: 36, backgroundColor: 'white', borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  nextFeedLabel: { fontSize: 11, fontWeight: '700', color: '#004D40', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  nextFeedTime: { fontSize: 16, fontWeight: '800', color: '#263238' },

  cardRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statusCard: { flex: 1, backgroundColor: 'white', borderRadius: 20, padding: 20, shadowColor: "#000", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#90A4AE' },
  cardValue: { fontSize: 26, fontWeight: '800', color: '#263238', marginBottom: 8 },
  cardSub: { fontSize: 13, color: '#B0BEC5' },
  progressBarBg: { height: 6, backgroundColor: '#ECEFF1', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  adminPanel: { backgroundColor: 'white', borderRadius: 18, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#ECEFF1' },
  adminButtonsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  adminBtn: { alignItems: 'center' },
  adminIconWrap: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  adminBtnText: { fontSize: 12, fontWeight: '700', color: '#546E7A' },

  staffPanel: { marginBottom: 24 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEBEE', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FFCDD2' },
  reportBtnText: { color: '#D32F2F', fontWeight: '700', fontSize: 15, marginLeft: 8 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#37474F' },
  addBtnSm: { backgroundColor: '#E0F2F1', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  addText: { color: '#004D40', fontWeight: '700', fontSize: 13 },

  listBox: { backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: '#ECEFF1', overflow: 'hidden', marginBottom: 32 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F5F7FA', backgroundColor: 'white' },
  itemTitle: { fontSize: 17, fontWeight: '700', color: '#37474F' },
  itemTitleAlt: { fontSize: 16, fontWeight: '600', color: '#37474F' },
  itemSub: { fontSize: 13, color: '#90A4AE', marginTop: 2 },
  emptyText: { padding: 24, textAlign: 'center', color: '#B0BEC5' },

  deleteAction: { backgroundColor: '#D32F2F', justifyContent: 'center', alignItems: 'center', width: 90, height: '100%' },
  deleteActionText: { color: 'white', fontWeight: 'bold', fontSize: 12, marginTop: 4 },
  
  historyIconWrap: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  fab: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: '#004D40', flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 28, shadowColor: "#004D40", shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  fabText: { color: 'white', fontSize: 18, fontWeight: '700', marginLeft: 10 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 24, padding: 32 },
  modalHeader: { fontSize: 22, fontWeight: '800', color: '#263238', marginBottom: 24, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 8, marginLeft: 4 },
  modalInput: { backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 14, padding: 16, fontSize: 16, marginBottom: 20, color: '#263238' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtnCancel: { flex: 1, padding: 16, backgroundColor: '#ECEFF1', borderRadius: 14, alignItems: 'center' },
  modalBtnSave: { flex: 1, padding: 16, backgroundColor: '#004D40', borderRadius: 14, alignItems: 'center' },
  modalBtnTextCancel: { color: '#546E7A', fontWeight: '700', fontSize: 15 },
  modalBtnTextSave: { color: 'white', fontWeight: '700', fontSize: 15 },
});