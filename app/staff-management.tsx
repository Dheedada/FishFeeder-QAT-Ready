import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/services/supabase';

export default function StaffManagement() {
  const router = useRouter();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false); 
  
  const [newName, setNewName] = useState('');
  const [newId, setNewId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); 

  const [staffList, setStaffList] = useState<any[]>([]);

  const fetchStaff = useCallback(async () => {
    if (!refreshing) setFetching(true); 
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, employee_id, email, role')
      .eq('role', 'user');

    if (error) {
      console.log("Error fetching staff:", error.message);
    } else if (data) {
      setStaffList(data);
    }
    
    setFetching(false);
    setRefreshing(false);
  }, [refreshing]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStaff();
  }, [fetchStaff]);

  const handleCreateStaff = async () => {
    // 1. Check if fields are empty
    if (!newName || !newId || !newEmail || !newPassword) {
      Alert.alert("Incomplete", "Please fill in all staff details.");
      return;
    }

    // --- NEW: VALIDATION 1 (Name cannot be only numbers) ---
    // This checks if the name consists strictly of digits from start to finish
    const isOnlyNumbers = /^\d+$/.test(newName.trim());
    if (isOnlyNumbers) {
      Alert.alert("Invalid Name", "Full Name cannot consist of only numbers. Please enter a valid name.");
      return;
    }

    // --- NEW: VALIDATION 2 (Prevent Duplicate Employee IDs) ---
    // This looks at our current staffList to see if the ID already exists
    const isIdTaken = staffList.some(staff => staff.employee_id === newId.trim());
    if (isIdTaken) {
      Alert.alert("Duplicate ID", `Employee ID "${newId}" is already assigned to another staff member. Please enter a unique ID.`);
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newEmail,
      password: newPassword,
    });

    if (authError) {
      Alert.alert("Error Creating Login", authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          email: newEmail,
          name: newName,
          employee_id: newId,
          role: 'user'
        });

      if (profileError) {
        if (profileError.message.includes('unique constraint "profiles_email_key"')) {
           Alert.alert("Duplicate Email Error", `The email "${newEmail}" is already assigned to another staff member. Please use a unique email.`, [{ text: "OK" }]);
        } else {
           Alert.alert("Profile Creation Error", `Failed to save staff info: ${profileError.message}`);
        }
      } else {
        Alert.alert("Success", `${newName} has been added as a Staff member!`, [{ text: "OK" }]);
        
        setNewName('');
        setNewId('');
        setNewEmail('');
        setNewPassword('');
        setShowPassword(false);
        setModalVisible(false);
        fetchStaff();
      }
    }
    setLoading(false);
  };

  const handleDeleteStaff = (id: string, name: string) => {
    Alert.alert(
      "Remove Staff",
      `Are you sure you want to permanently remove ${name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) {
              Alert.alert("Error", `Could not remove staff member: ${error.message}`);
            } else {
              fetchStaff();
            }
          } 
        }
      ]
    );
  };

  const renderStaffCard = ({ item }: { item: any }) => (
    <View style={styles.staffCard}>
      <View style={styles.cardLeft}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={20} color="#064E3B" />
        </View>
        <View>
          <Text style={styles.staffName}>{item.name || "Unnamed Staff"}</Text>
          <Text style={styles.staffId}>ID: {item.employee_id || "N/A"}</Text>
          <Text style={styles.staffEmail}>{item.email}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => handleDeleteStaff(item.id, item.name || item.email)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={24} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Management</Text>
        <TouchableOpacity onPress={fetchStaff}>
          <Ionicons name="refresh" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {fetching && !refreshing ? (
        <ActivityIndicator size="large" color="#064E3B" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={staffList}
          keyExtractor={item => item.id}
          renderItem={renderStaffCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={() => (
             <View style={{alignItems: 'center', marginTop: 40}}>
                <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyText}>No staff members found.</Text>
             </View>
          )}
        />
      )}

      <View style={styles.bottomContainer}>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="person-add" size={20} color="white" style={{ marginRight: 8 }} />
          <Text style={styles.addBtnText}>Add New Staff</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Staff Account</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40}}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. Juan Dela Cruz" 
                  value={newName} 
                  onChangeText={setNewName} 
                  placeholderTextColor="#B0BEC5"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Employee ID</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. 001" 
                  value={newId} 
                  onChangeText={setNewId} 
                  placeholderTextColor="#B0BEC5"
                  keyboardType="number-pad" 
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="staff@fish.com" 
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={newEmail} 
                  onChangeText={setNewEmail} 
                  placeholderTextColor="#B0BEC5"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Temporary Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput 
                    style={styles.passwordInput} 
                    placeholder="••••••••" 
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

              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateStaff} disabled={loading}>
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Create Account</Text>}
              </TouchableOpacity>
            </ScrollView>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#064E3B', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { paddingRight: 20 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', flex: 1, textAlign: 'center', marginRight: 20 },
  listContainer: { padding: 20, paddingBottom: 100 },
  staffCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, elevation: 2, shadowColor: "#000", shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 4 },
  cardLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  staffName: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  staffId: { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 2 },
  staffEmail: { fontSize: 13, color: '#64748B', marginTop: 2 },
  deleteBtn: { padding: 8 },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 12 },
  bottomContainer: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center' },
  addBtn: { flexDirection: 'row', backgroundColor: '#064E3B', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30, alignItems: 'center', elevation: 6, shadowColor: "#004D40", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8 },
  addBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, height: 52, fontSize: 15, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' },
  submitBtn: { backgroundColor: '#059669', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 20 },
  submitBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: '#E2E8F0' },
  passwordInput: { flex: 1, fontSize: 15, color: '#0F172A' },
  eyeBtn: { padding: 8, marginRight: -8 },
});