import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function Layout() {
  return (
    <View style={{ flex: 1, backgroundColor: '#004D40' }}>
      <StatusBar style="light" backgroundColor="#004D40" />
      <Stack screenOptions={{ 
        headerShown: false, 
        animation: 'fade',
        contentStyle: { backgroundColor: '#F5F7FA' }
      }}>
        {/* The Official App Map */}
        <Stack.Screen name="index" />
        <Stack.Screen name="dashboard" />
        
        {/* NEW: Added the Staff screens so the router knows they exist */}
        <Stack.Screen name="staff-dashboard" />
        <Stack.Screen name="staff-management" />
      </Stack>
    </View>
  );
}