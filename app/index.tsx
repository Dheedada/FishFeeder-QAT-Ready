import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from './src/services/supabase'; 
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const router = useRouter();
  
  const [loginType, setLoginType] = useState<'admin' | 'staff'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Incomplete", "Please enter both email and password.");
      return;
    }
    setLoading(true);

    // --- STRICT SIGN-IN LOGIC ONLY ---
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      Alert.alert("Login Failed", error.message);
    } else if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      const userRole = profile?.role || 'user'; 

      if (loginType === 'admin') {
        if (userRole !== 'admin') {
          Alert.alert("Access Denied", "This account does not have Admin privileges.");
          await supabase.auth.signOut();
        } else {
          router.replace('/dashboard'); 
        }
      } 
      else if (loginType === 'staff') {
        if (userRole === 'admin') {
          Alert.alert("Wrong Portal", "You are an Admin. Please use the Admin tab to sign in.");
          await supabase.auth.signOut();
        } else {
          router.replace('/staff-dashboard');
        }
      }
    }
    
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.headerBg} />
      <View style={styles.content}>
        <View style={styles.headerTextContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="fish" size={36} color="#004D40" />
          </View>
          {/* PERFECTLY STYLED CAPSTONE TITLE */}
          <Text style={styles.appName}>Mobile Fish Feeding System</Text>
          <Text style={styles.appTagline}>with Monitoring & SMS Notification{'\n'}for Pet Shops in Cainta</Text>
        </View>

        <View style={styles.loginCard}>
          <View style={styles.tabContainer}>
            <TouchableOpacity 
              style={[styles.tabButton, loginType === 'admin' && styles.tabActive]} 
              onPress={() => setLoginType('admin')}
            >
              <Text style={[styles.tabText, loginType === 'admin' && styles.tabTextActive]}>Admin</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabButton, loginType === 'staff' && styles.tabActive]} 
              onPress={() => setLoginType('staff')}
            >
              <Text style={[styles.tabText, loginType === 'staff' && styles.tabTextActive]}>Staff</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formTitle}>
            Sign In to {loginType === 'admin' ? 'Admin' : 'Staff'} Portal
          </Text>

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#546E7A" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="your@email.com"
                placeholderTextColor="#B0BEC5"
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#546E7A" style={styles.inputIcon} />
              <TextInput 
                style={styles.input} 
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor="#B0BEC5"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#90A4AE" />
              </TouchableOpacity>
            </View>
          </View>

          {/* "Forgot Password?" button has been professionally removed */}

          <TouchableOpacity style={styles.signInBtn} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.signInText}>Sign In</Text>}
          </TouchableOpacity>

        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  headerBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 280, backgroundColor: '#004D40', borderBottomRightRadius: 40 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  headerTextContainer: { alignItems: 'center', marginBottom: 25 },
  logoCircle: { width: 64, height: 64, backgroundColor: 'white', borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: "#000", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.1, shadowRadius: 8 },
  
  // FIXED STYLES FOR YOUR TITLE
  appName: { fontSize: 22, fontWeight: '700', color: 'white', letterSpacing: 0.5, textAlign: 'center' },
  appTagline: { fontSize: 13, color: '#B2DFDB', marginTop: 4, textAlign: 'center', paddingHorizontal: 10, lineHeight: 18 },
  
  loginCard: { backgroundColor: 'white', borderRadius: 24, padding: 24, shadowColor: "#004D40", shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#F0F3F5', borderRadius: 12, padding: 4, marginBottom: 24 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: 'white', shadowColor: "#000", shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#90A4AE' },
  tabTextActive: { color: '#004D40', fontWeight: '700' },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#263238', marginBottom: 20, textAlign: 'center' },
  inputWrapper: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#546E7A', marginBottom: 6, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, height: 52, borderWidth: 1, borderColor: '#E2E8F0' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#263238' },
  eyeBtn: { padding: 8, marginRight: -8 },
  signInBtn: { backgroundColor: '#004D40', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 12, shadowColor: "#004D40", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8, elevation: 2 },
  signInText: { color: 'white', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
});