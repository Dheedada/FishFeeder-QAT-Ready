import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { WebView } from 'react-native-webview'; 
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; 
import { supabase } from '../src/services/supabase';

// --- HARDWARE SETTINGS ---
// This must match the IP used in your Admin Dashboard
const ESP32_IP = "10.129.42.120";

export default function StaffDashboard() {
  const router = useRouter();
  
  // State Management
  const [foodLevel, setFoodLevel] = useState(0);
  const [isSystemOnline, setSystemOnline] = useState(true);
  const [showCamera, setShowCamera] = useState(false); 
  const [nextFeedTime, setNextFeedTime] = useState('Calculating...');
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchHistory();
   // fetchNextFeed();
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

  const fetchNextFeed = async () => {
    const { data } = await supabase.from('feeding_schedules').select('*').eq('is_active', true);
    if (data && data.length > 0) {
      // Simple logic to show the next one (matches your current app logic)
      setNextFeedTime("Scheduled Auto-Feed Active");
    } else {
      setNextFeedTime('No Active Schedules');
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
      // 1. Trigger the Hardware
      await fetch(`http://${ESP32_IP}/feed`);
      
      // 2. Log to Database (Identifies that Staff triggered it)
      await supabase.from('feeding_history').insert([{ status: 'Manual Feed (Staff)' }]);
      
      Alert.alert("Success!", "Feeding Started!");
      fetchHistory(); 
    } catch (error) {
      Alert.alert("Error", "Could not reach the feeder. Check Wi-Fi.");
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

  // CAMERA FIX: Wraps stream in HTML to prevent "White Box" on mobile
  const cameraHTML = `
    <html>
      <body style="margin:0;padding:0;background-color:black;display:flex;justify-content:center;align-items:center;height:100vh;">
        <img src="http://${ESP32_IP}:81/stream" style="width:100%;height:100%;object-fit:cover;" />
      </body>
    </html>
  `;

  return (
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
            <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#A7F3D0" />
            </TouchableOpacity>
          </View>
        </View>

        {showCamera && (
          <View style={styles.cameraContainer}>
            <WebView 
              source={{ html: cameraHTML }} 
              style={styles.cameraStream}
              scrollEnabled={false}
              javaScriptEnabled={true}
            />
          </View>
        )}

        {!showCamera && (
          <View style={styles.bannerCard}>
            <Ionicons name="time-outline" size={20} color="#065F46" style={{marginRight: 12}} />
            <View>
              <Text style={styles.bannerLabel}>UPCOMING AUTO-FEED</Text>
              <Text style={styles.bannerValue}>{nextFeedTime}</Text>
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
            <Text style={styles.systemSubtext}>Stable Connection</Text>
          </View>
        </View>

        {/* --- STAFF ACTIONS --- */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Staff Actions</Text>
          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={() => Alert.alert("Report", "Admin has been notified.")}>
              <View style={[styles.controlIconCircle, { backgroundColor: '#FEE2E2' }]}><Ionicons name="warning-outline" size={22} color="#EF4444" /></View>
              <Text style={styles.controlLabel}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={() => Alert.alert("Refill", "Please fill the 4-inch jar to the top.")}>
              <View style={[styles.controlIconCircle, { backgroundColor: '#D1FAE5' }]}><Ionicons name="cube-outline" size={22} color="#059669" /></View>
              <Text style={styles.controlLabel}>Refill</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* --- FEEDING HISTORY --- */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Feeding History</Text>
          {history.map((log) => (
            <View key={log.id} style={styles.historyItem}>
              <View style={styles.historyDot} />
              <View>
                <Text style={styles.historyTime}>{log.time}</Text>
                <Text style={styles.historyStatus}>{log.status}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#059669" style={{marginLeft: 'auto'}} />
            </View>
          ))}
        </View>
      </ScrollView>

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
  header: { backgroundColor: '#064E3B', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  welcomeText: { color: '#A7F3D0', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  headerIcons: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  cameraContainer: { height: 200, width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: 'black', marginTop: 10 },
  cameraStream: { flex: 1 },
  bannerCard: { backgroundColor: '#D1FAE5', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  bannerLabel: { color: '#065F46', fontSize: 10, fontWeight: 'bold' },
  bannerValue: { color: '#064E3B', fontSize: 16, fontWeight: 'bold' },
  content: { padding: 20, paddingTop: 10 },
  gridContainer: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statusCard: { flex: 1, backgroundColor: 'white', borderRadius: 20, padding: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardLabel: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  foodPercent: { fontSize: 32, fontWeight: 'bold', color: '#EF4444', marginBottom: 8 },
  progressBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3 },
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
  feedNowText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});