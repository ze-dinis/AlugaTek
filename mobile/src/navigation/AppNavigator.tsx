import React, {useCallback, useEffect, useState} from 'react';
import {Text} from 'react-native';
import {NavigationContainer, createNavigationContainerRef, useFocusEffect} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useAuthStore} from '../store/authStore';
import {i18n} from '../locales';
import {chatService} from '../services/chatService';

// Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import HomeScreen from '../screens/Home/HomeScreen';
import ItemDetailScreen from '../screens/Items/ItemDetailScreen';
import MyRentalsScreen from '../screens/Rentals/MyRentalsScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import CreateItemScreen from '../screens/Items/CreateItemScreen';
import MyItemsScreen from '../screens/Items/MyItemsScreen';
import ChatListScreen from '../screens/Chat/ChatListScreen';
import ChatDetailScreen from '../screens/Chat/ChatDetailScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  ItemDetail: {itemId: string};
  CreateItem: undefined;
  MyItems: undefined;
  EditItem: {itemId: string};
  Chat: {itemId: string; itemTitle: string; otherUserId: string; otherName: string};
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  MyRentals: undefined;
  Announce: undefined;
  ChatList: undefined;
  Profile: undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{headerShown: false}}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function MainTabNavigator() {
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const refreshUnreadMessagesCount = useCallback(async () => {
    try {
      const {data} = await chatService.getConversations();
      const unreadCount = data.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
      setUnreadMessagesCount(unreadCount);
    } catch {
      // keep the current badge count on transient API failures
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshUnreadMessagesCount();
    }, [refreshUnreadMessagesCount]),
  );

  useEffect(() => {
    const intervalId = setInterval(refreshUnreadMessagesCount, 30000);
    return () => clearInterval(intervalId);
  }, [refreshUnreadMessagesCount]);

  return (
    <MainTab.Navigator>
      <MainTab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          title: i18n.navigation.home,
          tabBarIcon: ({color}) => <Text style={{fontSize: 18, color}}>{'🏠'}</Text>,
        }}
      />
      <MainTab.Screen
        name="MyRentals"
        component={MyRentalsScreen}
        options={{
          title: i18n.navigation.myRentals,
          tabBarIcon: ({color}) => <Text style={{fontSize: 18, color}}>{'🗓️'}</Text>,
        }}
      />
      <MainTab.Screen
        name="Announce"
        component={HomeScreen}
        listeners={({navigation}) => ({
          tabPress: e => {
            e.preventDefault();
            navigation.getParent()?.navigate('CreateItem');
          },
        })}
        options={{
          title: i18n.navigation.announce,
          tabBarIcon: ({color}) => <Text style={{fontSize: 18, color}}>{'➕'}</Text>,
        }}
      />
      <MainTab.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{
          title: i18n.navigation.messages,
          tabBarIcon: ({color}) => <Text style={{fontSize: 18, color}}>{'💬'}</Text>,
          tabBarBadge: unreadMessagesCount > 0 ? (unreadMessagesCount > 99 ? '99+' : unreadMessagesCount) : undefined,
        }}
      />
      <MainTab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: i18n.navigation.profile,
          tabBarIcon: ({color}) => <Text style={{fontSize: 18, color}}>{'👤'}</Text>,
        }}
      />
    </MainTab.Navigator>
  );
}

export default function AppNavigator() {
  const {user} = useAuthStore();

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{headerShown: false}}>
        {user ? (
          <>
            <RootStack.Screen name="Main" component={MainTabNavigator} />
            <RootStack.Screen
              name="ItemDetail"
              component={ItemDetailScreen}
              options={{headerShown: true, title: 'Detalhes'}}
            />
            <RootStack.Screen
              name="CreateItem"
              component={CreateItemScreen}
              options={{headerShown: true, title: i18n.navigation.createItem}}
            />
            <RootStack.Screen
              name="MyItems"
              component={MyItemsScreen}
              options={{headerShown: true, title: i18n.navigation.myItems}}
            />
            <RootStack.Screen
              name="EditItem"
              component={CreateItemScreen}
              options={{headerShown: true, title: i18n.item.editTitle}}
            />
            <RootStack.Screen
              name="Chat"
              component={ChatDetailScreen}
              options={{headerShown: true}}
            />
          </>
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
