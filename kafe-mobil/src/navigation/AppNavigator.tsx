import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import BusinessLoginScreen from '../screens/BusinessLoginScreen';
import LoginScreen from '../screens/LoginScreen';
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import WaiterPanelScreen from '../screens/WaiterPanelScreen';
import KitchenPanelScreen from '../screens/KitchenPanelScreen';
import AdminPanelScreen from '../screens/AdminPanelScreen';
import CashierPanelScreen from '../screens/CashierPanelScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        screenOptions={{ headerShown: false, animation: 'fade' }} 
        initialRouteName="BusinessLogin"
      >
        <Stack.Screen name="BusinessLogin" component={BusinessLoginScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
        <Stack.Screen name="WaiterPanel" component={WaiterPanelScreen} />
        <Stack.Screen name="KitchenPanel" component={KitchenPanelScreen} />
        <Stack.Screen name="CashierPanel" component={CashierPanelScreen} />
        <Stack.Screen name="AdminPanel" component={AdminPanelScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
