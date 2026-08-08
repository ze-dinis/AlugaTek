import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
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
import UserReviewsScreen from '../screens/Profile/UserReviewsScreen';
import CreateItemScreen from '../screens/Items/CreateItemScreen';
import MyItemsScreen from '../screens/Items/MyItemsScreen';
import MyFavoritesScreen from '../screens/Items/MyFavoritesScreen';
import ChatListScreen from '../screens/Chat/ChatListScreen';
import ChatDetailScreen from '../screens/Chat/ChatDetailScreen';
import EarningsCalculatorScreen from '../screens/Home/EarningsCalculatorScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  ItemDetail: {itemId: string};
  EarningsCalculator: undefined;
  CreateItem: undefined;
  MyItems: undefined;
  MyFavorites: undefined;
  EditItem: {itemId: string};
  Chat: {itemId: string; itemTitle: string; otherUserId: string; otherName: string};
  UserReviews: {userId: string; userName: string};
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
  const user = useAuthStore(s => s.user);
  const isLoading = useAuthStore(s => s.isLoading);

  // Until the persisted session is read back, `user` is still null. Rendering
  // the navigator now would mount the whole Auth stack and then tear it down a
  // tick later when hydration finishes — that mount/unmount race during cold
  // start is what crashed the app on the first open while native modules were
  // still warming up (the second open then worked).
  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

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
              name="EarningsCalculator"
              component={EarningsCalculatorScreen}
              options={{headerShown: true, title: 'Calculadora de ganhos'}}
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
              name="MyFavorites"
              component={MyFavoritesScreen}
              options={{headerShown: true, title: i18n.navigation.myFavorites}}
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
            <RootStack.Screen
              name="UserReviews"
              component={UserReviewsScreen}
              options={{headerShown: true, title: 'Avaliações'}}
            />
          </>
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
