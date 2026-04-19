import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, SectionList, TouchableOpacity, 
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; 
import { supabase } from '../src/services/supabase'; // <-- FIXED PATH

export default function DetailedReport() {
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false); 
  const [groupedHistory, setGroupedHistory] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, auto: 0, manual: 0, refills: 0 });

  const formatDateHeader = (dateStr: string) => {
     const today = new Date(); today.setHours(0,0,0,0);
     const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
     const itemDate = new Date(dateStr); itemDate.setHours(0,0,0,0);
     if (itemDate.getTime() === today.getTime()) return "Today";
     if (itemDate.getTime() === yesterday.getTime()) return "Yesterday";
     return itemDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }

  const calculateStats = (rawData: any[]) => {
      let autoCount = 0; let manualCount = 0; let refillCount = 0;
      rawData.forEach(item => {
          const status = item.status.toLowerCase();
          if (status.includes('auto')) autoCount++;
          else if (status.includes('feed')) manualCount++;
          else if (status.includes('refill')) refillCount++;
      });
      setStats({ total: rawData.length, auto: autoCount, manual: manualCount, refills: refillCount });
  }

  const fetchAllHistory = useCallback(async () => {
    if (!refreshing) setFetching(true); 
    const { data, error } = await supabase.from('feeding_history').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) {
      calculateStats(data);
      const groups = data.reduce((acc: any, item: any) => {
          const date = item.created_at.split('T')[0];
          if (!acc[date]) acc[date] = [];
          acc[date].push({ ...item, formattedTime: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
          return acc;
      }, {});
      const sectionData = Object.keys(groups).map(dateKey => ({ title: formatDateHeader(dateKey), data: groups[dateKey] }));
      setGroupedHistory(sectionData);
    }
    setFetching(false); setRefreshing(false);
  }, [refreshing]);

  useEffect(() => { fetchAllHistory(); }, [fetchAllHistory]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={28} color="white" /></TouchableOpacity>
        <Text style={styles.headerTitle}>System Report</Text>
        <TouchableOpacity onPress={() => setRefreshing(true)}><Ionicons name="refresh" size={24} color="white" /></TouchableOpacity>
      </View>
      <View style={styles.statsContainer}>
          <View style={[styles.statCard, {backgroundColor: '#EFF6FF'}]}><Text style={[styles.statLabel, {color: '#1E40AF'}]}>AUTO</Text><Text style={[styles.statValue, {color: '#1D4ED8'}]}>{stats.auto}</Text></View>
          <View style={[styles.statCard, {backgroundColor: '#ECFDF5'}]}><Text style={[styles.statLabel, {color: '#065F46'}]}>MANUAL</Text><Text style={[styles.statValue, {color: '#059669'}]}>{stats.manual}</Text></View>
          <View style={[styles.statCard, {backgroundColor: '#FFFBEB'}]}><Text style={[styles.statLabel, {color: '#92400E'}]}>REFILLS</Text><Text style={[styles.statValue, {color: '#B45309'}]}>{stats.refills}</Text></View>
      </View>
      <SectionList
        sections={groupedHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.historyItem}>
            <View style={[styles.historyDot, item.status.toLowerCase().includes('refill') && {backgroundColor: '#B45309'}]} />
            <View><Text style={styles.historyTime}>{item.formattedTime}</Text><Text style={styles.historyStatus}>{item.status}</Text></View>
            <Ionicons name="checkmark-circle" size={20} color="#059669" style={{marginLeft: 'auto'}} />
          </View>
        )}
        renderSectionHeader={({ section: { title } }) => (<View style={styles.sectionHeaderContainer}><Text style={styles.sectionHeaderTitle}>{title}</Text></View>)}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#064E3B', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  backBtn: { paddingRight: 20 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center', marginRight: 40 },
  statsContainer: { flexDirection: 'row', gap: 10, padding: 20, justifyContent: 'space-between'},
  statCard: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center'},
  statLabel: { fontSize: 10, fontWeight: '800' },
  statValue: { fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  historyItem: { backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 8, marginHorizontal: 20, elevation: 1 },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#059669', marginRight: 12 },
  historyTime: { fontSize: 14, fontWeight: 'bold', color: '#0F172A' },
  historyStatus: { fontSize: 12, color: '#64748B' },
  sectionHeaderContainer: { paddingTop: 20, paddingBottom: 10, paddingHorizontal: 20 },
  sectionHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#475569' },
});