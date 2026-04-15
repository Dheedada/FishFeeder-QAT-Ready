import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// --- CONFIGURATION ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#004D40' }}>
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
    </GestureHandlerRootView>
  );
}