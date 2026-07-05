import React from 'react';
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useAuthStore} from '../store/authStore';
import {i18n} from '../locales';

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
  EditItem: {itemId: string};
  Chat: {otherId: string; otherName: string};
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  MyItems: undefined;
  MyRentals: undefined;
  ChatList: undefined;
  Profile: undefined;
};

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
        name="MyItems"
        component={MyItemsScreen}
        options={{
          title: i18n.navigation.myItems,
          tabBarIcon: ({color}) => <Text style={{fontSize: 18, color}}>{'📦'}</Text>,
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
        name="ChatList"
        component={ChatListScreen}
        options={{
          title: i18n.navigation.messages,
          tabBarIcon: ({color}) => <Text style={{fontSize: 18, color}}>{'💬'}</Text>,
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
    <NavigationContainer>
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
